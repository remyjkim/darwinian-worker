([.jobs[] |
  select(.name == "Validate authorized tag" and .conclusion == "success")] | length) == 1 and
([.jobs[] |
  select(.name == "Publish I336 candidate to npm" and .conclusion == "failure")] | length) == 1
