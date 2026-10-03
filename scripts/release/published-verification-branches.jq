.total_count == 1 and
([.branch_policies[] | select(.name == "main" and .type == "branch")] | length) == 1
