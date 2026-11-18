# 0023. Batch compaction

Status: accepted.

## Context

The compaction had three run forms: `parallel`, `batch`, and `auto`. The key `compaction.mode`
selected one form. The form `auto` read the model family from a cache value. A broken batch answer
made one retry, and then it used the form `parallel`.

## Decision

The compaction makes one model call for one batch of ready merge inputs. The key `batch` gives the
count of inputs of one call. Its default is ten, and the value is a whole number above zero. The key
sets no upper limit, and the load rejects a value below one. The key `compaction.mode` leaves the
configuration, and the section keeps no compatibility form. The load rejects the key `mode` as an
unknown key.

A batch answer publishes each range with a good line at once. An absent line, an empty line, and a
line that fails the shrink check leave their ranges open. The compaction retries the open ranges in
a batch of half the size, down to one input. A range that no attempt builds stays dirty for the next
pass.

## Alternatives

Keep the three forms: the user must select a form that fits the model cache, and the product carries
three code paths for one result.
Keep the form `auto` only: the product reads the cache knowledge of the model, and a wrong guess
changes the cost.
Fix the batch at ten: the key `batch` leaves the configuration, and a user cannot lower the cost of
one call.
Keep the upper limit at ten: a scope with many dirty ranges needs several passes. The user cannot
then trade the cost of a pass for the time of a pass.
Clamp a value above ten: a wrong value gives no error, and the user learns no limit.
Accept the key `mode`: the product carries a key with no effect, and the user keeps a setting that
changes nothing.
Retry the whole batch: one bad line loses nine good lines, and the cost of the pass grows.

## Consequences

The default batch fills one call, so the cost of one pass is easier to estimate. A batch above ten
makes one call with more inputs, so one answer can be long and one call can cost more. A bad line
costs only its own retry, and the good lines of the same answer stay. The retries stop at one input,
and a range that still fails waits for the next pass.
A file that holds `mode` fails the check, and the user removes the key. The plugin starts on the
built-in defaults after a rejected base file, and a reload keeps the last valid configuration.
