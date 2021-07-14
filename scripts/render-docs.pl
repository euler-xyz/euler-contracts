#!/usr/bin/env perl

use strict;

use Template;
use Data::Dumper;


my $tt = Template->new() || die "$Template::ERROR\n";


my $ctx = loadContracts([qw{
    modules/EToken
}]);



$ctx->{indent} = sub {
    my $txt = shift;
    $txt =~ s{^}{    }mg;
    return $txt;
};


print Dumper($ctx);
$tt->process('scripts/templates/docs.md.tt', $ctx, 'docs/gen.md') || die $tt->error();


sub loadContracts {
    my $contracts = shift;

    my @outputs;

    for my $contract (@$contracts) {
        my $file = slurp_file("contracts/$contract.sol");

        $contract =~ /(\w+)$/;
        my $name = "IEuler$1";

        my $output = {
            name => $name,
        };

        my @lines = split /\n/, $file;

        while (@lines) {
            my $line = shift @lines;

            if ($line =~ m{^\s*///}) {
                my $rec = {};

                while ($line =~ m{^\s*///}) {
                    $line =~ s{^\s*///\s*}{};
                    push @{ $rec->{natspec} }, $line;
                    $line = shift @lines;
                }

                $rec->{natspec} = procNatspec($rec->{natspec});

                if ($line =~ m{^\s*contract}) {
                    $output->{natspec} = $rec->{natspec};
                    next;
                } elsif ($line =~ m{^\s*function (\w+)}) {
                    $rec->{type} = 'function';
                    $rec->{name} = $1;
                    $rec->{def} = cleanupFunction($line);
                } elsif ($line =~ m{^\s*(struct|interface) (\w+)}) {
                    $rec->{type} = $1;
                    $rec->{name} = $2;
                    while ($line !~ m/^\s*\}/) {
                        $rec->{def} .= $line . "\n";
                        $line = shift @lines;
                    }
                    $rec->{def} .= $line;
                    $rec->{def} = deIndent($rec->{def});
                } else {
                    die "unexpected trailing line: $line";
                }

                push @{ $output->{items} }, $rec;
            }
        }

        push @outputs, $output;
    }

    return { contracts => \@outputs, };
}


sub cleanupFunction {
    my $line = shift;

    $line =~ s/^\s*//;
    $line =~ s/\s*\{\s*$//;

    if ($line =~ m{^function\s+(\w+)\s*\(([^)]*)\)\s*(.*)}) {
        my ($name, $args, $modifiers) = ($1, $2, $3);
        my $ret;
        if ($modifiers =~ m{returns\s*\(.*\)}) {
            $ret = " $&";
        }

        return "function $name($args) external$ret";
    } else {
        die "couldn't parse function line: $line";
    }
}


sub deIndent {
    my $code = shift;
    $code =~ /^(\s*)/;
    my $leading = $1;
    $code =~ s/^$leading//mg;
    return $code;
}


sub procNatspec {
    my $lines = shift;

    my $output = {
        raw => join "\n", @$lines,
    };

    for my $line (@$lines) {
        $line =~ s{^/// }{};
        $line = "\@notice $line" unless $line =~ /^\@/;

        if ($line =~ m{^\@param (\w+)\s*(.*)}) {
            push @{ $output->{params} }, { name => $1, desc => $2, };
        } elsif ($line =~ m{^@(\w+)\s*(.*)}) {
            if ($1 eq 'return') {
                push @{ $output->{$1} }, $2;
            } else {
                $output->{$1} = $2;
            }
        }
    }

    return $output;
}



sub slurp_file {
    my $filename = shift // die "need filename";

    open(my $fh, '<', $filename) || die "couldn't open '$filename' for reading: $!";

    local $/;
    return <$fh>;
}

sub unslurp_file {
    my $contents = shift;
    my $filename = shift;

    open(my $fh, '>', $filename) || die "couldn't open '$filename' for writing: $!";

    print $fh $contents;
}
