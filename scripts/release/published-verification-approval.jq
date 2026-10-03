length == 1 and
.[0].state == "approved" and
.[0].user.login == "mind001-cl" and
([.[0].environments[] |
  select(.name == "darwinian-release-verification")] | length) == 1
