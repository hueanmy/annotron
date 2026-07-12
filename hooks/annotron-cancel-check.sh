#!/bin/sh
# annotron PreToolUse hook.
# When a user clicks "Cancel" in the annotron review editor while the agent is
# mid-round, this hook denies the next tool call so the agent stops promptly —
# no need for the agent to remember to poll `annotron check`.
#
# Design goals:
#   * Zero cost when annotron is not running (curl fails fast → allow).
#   * Never block annotron's own CLI, so the agent can still reply / re-poll.
#   * No hard dependency on jq (uses curl + POSIX string matching only).

input=$(cat)

# Always allow annotron's own commands (poll/reply/check/progress/stop) so the
# agent can report the cancellation and re-arm its poll loop.
case "$input" in
  *annotron*) exit 0 ;;
esac

host="${ANNOTRON_HOST:-127.0.0.1}"
port="${ANNOTRON_PORT:-7321}"

# Short timeout so a hung/absent server never stalls a tool call.
resp=$(curl -s --max-time 1 "http://$host:$port/cancel-check" 2>/dev/null) || exit 0
[ -z "$resp" ] && exit 0

case "$resp" in
  *'"cancelled":true'*)
    cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"annotron: the user cancelled the current review. Stop immediately — do not run further tools. Report what you finished by replying on the artifact you are reviewing (annotron poll <file> --reply \"Stopped — cancelled by user.\"), then wait for new feedback."}}
JSON
    exit 0 ;;
esac

exit 0
