#!/bin/bash
# Runs a Linux CEF export with each test case and records every process's command line.
# Usage: dist/linux-test.sh /path/to/export/<game executable>
# Output: dist/linux-test.log. Take a screenshot of each window, then close it to move to the next case.
set -u
exe="$1"
log="$(dirname "$0")/linux-test.log"
: > "$log"

run_case() {
	echo "=== case: $*" | tee -a "$log"
	"$exe" "$@" &
	local pid=$!
	sleep 5
	# The game's own process and all of its descendants (CEF subprocesses).
	local pids="$pid $(pgrep -P "$pid") $(for p in $(pgrep -P "$pid"); do pgrep -P "$p"; done)"
	for p in $pids; do
		[ -r /proc/$p/cmdline ] || continue
		printf 'pid %s ppid %s: ' "$p" "$(awk '{print $4}' /proc/$p/stat)" >> "$log"
		tr '\0' '\n' < /proc/$p/cmdline | sed 's/.*/<&>/' | tr '\n' ' ' >> "$log"
		echo >> "$log"
	done
	echo "Screenshot the window, then close it."
	wait "$pid"
}

run_case --level=3 --fullscreen save1.json
run_case save1.json --name "two words" -abc -- --literal
run_case --offset -5
run_case
run_case --name=Zoë
echo "Done. Log: $log"
