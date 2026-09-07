#!/usr/bin/env perl
# marpa-worker.pl — JSONL worker for the OMP Marpa reasoning POC.
# Protocol: one JSON object per line on stdin, exactly one JSON object per line on stdout.
# stdout is protocol-only; diagnostics go to stderr. Worker stays alive across requests.
use strict;
use warnings;
use Marpa::R2;
use JSON::PP ();

binmode STDIN,  ":raw";
binmode STDOUT, ":raw";
binmode STDERR, ":utf8";
$| = 1;

my $JSON   = JSON::PP->new->utf8->canonical;
my $TRUE   = JSON::PP::true;
my $FALSE  = JSON::PP::false;
my $NULL   = JSON::PP::null;

# ---- fixed, safe semantic-action vocabulary (no arbitrary Perl) ----
# The grammar references these names via `action => store/add/print/emit`; the worker
# resolves them through semantics_package => 'Reason'. Each action receives
# (context_hashref, keyword_literal, ...children).
#
# store / add / print observe or mutate internal state (vars) and computed output
# (output). emit is the context-emission primitive: it renders the matched rule's
# RHS values (literal template words + captured lexemes) into one space-joined
# string that is returned to the LLM as machine-generated text.
package Reason;
our $runtime;   # { vars => { key => num }, output => [ strings ], emitted => [ strings ] }

sub store { shift; my ($kw, $key, $value) = @_; $runtime->{vars}{$key} = 0 + $value; return $value; }
sub add   { shift; my ($kw, $key, $delta) = @_; my $cur = $runtime->{vars}{$key} // 0; my $n = $cur + $delta; $runtime->{vars}{$key} = $n; return $n; }
sub print { shift; my ($kw, $key) = @_; my $v = $runtime->{vars}{$key} // 'undef'; my $s = "$key=$v"; push @{$runtime->{output}}, $s; return $s; }
sub emit  { shift; my $s = join ' ', map { defined $_ ? "$_" : '' } @_; push @{$runtime->{emitted}}, $s if length $s; return $s; }

package main;

my %STATES;         # state_id => { state_id, current_version, grammars{v=>obj}, grammar_sources{v=>str}, fragments[], last_parse }
my $state_counter = 0;

sub new_id { return "r" . ++$state_counter; }

sub send_response {
    my ($resp) = @_;
    print $JSON->encode($resp), "\n";
}

sub send_error {
    my ($id, $code, $message) = @_;
    send_response({ id => $id, ok => $FALSE, error => { code => $code, message => "$message" } });
}

sub clean_error {
    my ($err) = @_;
    $err = "$err";
    $err =~ s/\s+\z//;
    $err =~ s/\n?\s*Marpa::R2 exception at \S+ line \d+\.\s*\z//s;
    $err =~ s/\n?\s*at \S+ line \d+\.\s*\z//s;
    return $err;
}

sub get_state {
    my ($id, $sid) = @_;
    if (!defined $sid || !length "$sid") {
        send_error($id, "BAD_ARGS", "missing 'state_id'");
        return undef;
    }
    if (!exists $STATES{$sid}) {
        send_error($id, "UNKNOWN_STATE", "unknown state_id '$sid'");
        return undef;
    }
    return $STATES{$sid};
}

sub compile_grammar {
    my ($source) = @_;
    return Marpa::R2::Scanless::G->new({ source => \$source });
}

# Recursively render a parse value into an S-expression string so distinct
# parse trees (ambiguities) are visibly different, not just counted.
sub _render {
    my ($node) = @_;
    if (ref($node) eq 'ARRAY') {
        return '(' . join(' ', map { _render($_) } @$node) . ')';
    } elsif (ref($node) eq 'SCALAR') {
        return _render($$node);
    } elsif (ref($node) eq 'REF') {
        return _render($$node);
    } elsif (defined $node) {
        return "$node";
    } else {
        return '';
    }
}

sub do_parse {
    my ($state) = @_;
    my $grammar = $state->{grammars}{ $state->{current_version} };
    my $input   = join " ", map { $_->{text} } @{ $state->{fragments} };

    my $recce = Marpa::R2::Scanless::R->new({ grammar => $grammar });
    my ($status, $error, $value_count);
    my @values = ();
    $value_count = 0;

    my $ok = eval {
        $recce->read(\$input);
        while (defined(my $v = $recce->value())) {
            $value_count++;
            push @values, _render($v) if @values < 5;
        }
        1;
    };
    if (!$ok) {
        $error  = clean_error($@);
        $status = "INVALID";
    } elsif ($value_count > 1) {
        $status = "AMBIGUOUS";
    } else {
        $status = "VALID";
    }

    my $result = {
        status          => $status,
        grammar_version => $state->{current_version},
        fragment_count  => scalar @{ $state->{fragments} },
        values          => \@values,
        value_count     => $value_count,
    };
    $result->{error} = $error if defined $error;
    $state->{last_parse} = $result;
    return $result;
}

# ---- ops ----

sub op_create {
    my ($id, $req) = @_;
    my $grammar = $req->{grammar};
    if (!defined $grammar || !length "$grammar") {
        send_error($id, "BAD_ARGS", "create requires a non-empty 'grammar' string");
        return;
    }
    my $g;
    my $ok = eval { $g = compile_grammar($grammar); 1 };
    if (!$ok) {
        send_error($id, "GRAMMAR_ERROR", clean_error($@));
        return;
    }
    my $state_id = (defined $req->{state_id} && length("$req->{state_id}"))
        ? "$req->{state_id}" : new_id();
    if (exists $STATES{$state_id}) {
        send_error($id, "STATE_EXISTS", "state_id '$state_id' already exists");
        return;
    }
    $STATES{$state_id} = {
        state_id        => $state_id,
        current_version => 1,
        grammars        => { 1 => $g },
        grammar_sources => { 1 => "$grammar" },
        fragments       => [],
        last_parse      => undef,
    };
    send_response({ id => $id, ok => $TRUE, state_id => $state_id, grammar_version => 1 });
}

sub op_add {
    my ($id, $req) = @_;
    my $state = get_state($id, $req->{state_id}) or return;
    my $fragment = $req->{fragment};
    if (!defined $fragment) {
        send_error($id, "BAD_ARGS", "add requires a 'fragment' string");
        return;
    }
    my $seq = scalar @{ $state->{fragments} } + 1;
    my $fid = "f" . $seq;
    push @{ $state->{fragments} }, { id => $fid, seq => $seq, text => "$fragment" };
    send_response({ id => $id, ok => $TRUE, fragment_id => $fid, seq => $seq });
}

sub op_parse {
    my ($id, $req) = @_;
    my $state = get_state($id, $req->{state_id}) or return;
    my $result = do_parse($state);
    send_response({ id => $id, ok => $TRUE, %$result });
}

sub op_inspect {
    my ($id, $req) = @_;
    my $state = get_state($id, $req->{state_id}) or return;
    send_response({
        id => $id, ok => $TRUE,
        state_id        => $state->{state_id},
        grammar_version => $state->{current_version},
        fragment_count  => scalar @{ $state->{fragments} },
        grammar_source  => $state->{grammar_sources}{ $state->{current_version} },
        last_parse      => $state->{last_parse},
    });
}

sub op_extend {
    my ($id, $req) = @_;
    my $state = get_state($id, $req->{state_id}) or return;
    my $grammar = $req->{grammar};
    if (!defined $grammar || !length "$grammar") {
        send_error($id, "BAD_ARGS", "extend requires a non-empty 'grammar' string");
        return;
    }
    my $g;
    my $ok = eval { $g = compile_grammar($grammar); 1 };
    if (!$ok) {
        send_error($id, "GRAMMAR_ERROR", clean_error($@));
        return;
    }
    my $new_version = $state->{current_version} + 1;
    $state->{grammars}{$new_version} = $g;
    $state->{grammar_sources}{$new_version} = "$grammar";
    $state->{current_version} = $new_version;
    my $result = do_parse($state);
    send_response({ id => $id, ok => $TRUE, grammar_version => $new_version, %$result });
}

sub op_execute {
    my ($id, $req) = @_;
    my $state = get_state($id, $req->{state_id}) or return;
    my $input = $req->{input};
    if (!defined $input) {
        send_error($id, "BAD_ARGS", "execute requires an 'input' string");
        return;
    }
    # Fresh runtime per stream; the installed grammar is reused unchanged.
    $Reason::runtime = { vars => {}, output => [], emitted => [] };
    my $grammar = $state->{grammars}{ $state->{current_version} };
    my $recce = Marpa::R2::Scanless::R->new({ grammar => $grammar, semantics_package => 'Reason' });
    my ($status, $error);
    my $ok = eval {
        $recce->read(\$input);
        $status = $recce->ambiguous() ? "AMBIGUOUS" : "VALID";
        my $value = $recce->value();   # runs actions exactly once for a deterministic parse
        1;
    };
    if (!$ok) {
        $error  = clean_error($@);
        $status = "INVALID";
    }
    my $resp = {
        id => $id, ok => $TRUE,
        status          => $status,
        grammar_version => $state->{current_version},
        output          => $Reason::runtime->{output},
        emitted         => $Reason::runtime->{emitted},
        vars            => $Reason::runtime->{vars},
    };
    $resp->{error} = $error if defined $error;
    send_response($resp);
}

sub op_reset {
    my ($id, $req) = @_;
    my $sid = $req->{state_id};
    if (!defined $sid || !length "$sid") {
        send_error($id, "BAD_ARGS", "reset requires a 'state_id'");
        return;
    }
    if (!exists $STATES{$sid}) {
        send_error($id, "UNKNOWN_STATE", "unknown state_id '$sid'");
        return;
    }
    delete $STATES{$sid};
    send_response({ id => $id, ok => $TRUE });
}

# ---- main loop ----

while (defined(my $line = <STDIN>)) {
    $line =~ s/^\x{FEFF}//;   # strip BOM
    $line =~ s/\s+$//;        # strip trailing whitespace / CR
    next unless length $line;

    my $req;
    my $ok = eval { $req = $JSON->decode($line); 1 };
    if (!$ok) {
        send_response({ id => $NULL, ok => $FALSE, error => { code => "PARSE_ERROR", message => "malformed JSON line" } });
        next;
    }
    if (ref($req) ne 'HASH') {
        send_response({ id => $NULL, ok => $FALSE, error => { code => "PARSE_ERROR", message => "request must be a JSON object" } });
        next;
    }

    my $id = exists $req->{id} ? $req->{id} : $NULL;
    my $op = $req->{op};
    if (!defined $op || !length "$op") {
        send_error($id, "BAD_OP", "missing 'op' field");
        next;
    }

    if    ($op eq 'create')  { op_create($id, $req); }
    elsif ($op eq 'add')     { op_add($id, $req); }
    elsif ($op eq 'parse')   { op_parse($id, $req); }
    elsif ($op eq 'inspect') { op_inspect($id, $req); }
    elsif ($op eq 'extend')  { op_extend($id, $req); }
    elsif ($op eq 'execute') { op_execute($id, $req); }
    elsif ($op eq 'reset')   { op_reset($id, $req); }
    else { send_error($id, "BAD_OP", "unknown op '$op'"); }
}

exit 0;
