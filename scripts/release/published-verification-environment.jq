.name == "darwinian-release-verification" and
.can_admins_bypass == false and
.deployment_branch_policy.custom_branch_policies == true and
([.protection_rules[] | select(.type == "required_reviewers")] | length) == 1 and
([.protection_rules[] | select(.type == "required_reviewers")][0] |
  .prevent_self_review == true and
  [.reviewers[].reviewer.login] == ["mind001-cl"])
