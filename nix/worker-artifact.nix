{
  pkgs,
  repoRoot,
  sourceCommit,
}:

let
  lib = pkgs.lib;
  package = builtins.fromJSON (builtins.readFile (repoRoot + "/package.json"));
  version = package.version;
  source = lib.fileset.toSource {
    root = repoRoot;
    fileset = lib.fileset.unions [
      (repoRoot + "/cli")
      (repoRoot + "/registry")
      (repoRoot + "/skills")
      (repoRoot + "/package.json")
      (repoRoot + "/README.md")
      (repoRoot + "/LICENSE")
      (repoRoot + "/CONTRIBUTING.md")
      (repoRoot + "/docs/assets/darwinian-worker-logo.png")
    ];
  };
in
pkgs.runCommand "darwinian-worker-artifact-${version}"
  {
    nativeBuildInputs = [
      pkgs.nodejs_24
      pkgs.jq
    ];
    NPM_CONFIG_OFFLINE = "true";
  }
  ''
    if ! [[ "${sourceCommit}" =~ ^[a-f0-9]{40}$ ]] ||
       [ "${sourceCommit}" = "0000000000000000000000000000000000000000" ]; then
      echo "The Nix artifact requires a clean, full source commit." >&2
      exit 1
    fi
    cp -R ${source} source
    chmod -R u+w source
    cd source
    mkdir -p cli/generated
    umask 077
    jq -nc --arg version "${version}" --arg sourceCommit "${sourceCommit}" \
      '{schema:"darwinian.worker.build-identity",schemaVersion:1,version:$version,sourceCommit:$sourceCommit}' \
      > cli/generated/build-identity.json
    umask 022
    mkdir -p "$out"
    npm pack --ignore-scripts --json --pack-destination "$out" \
      --cache "$TMPDIR/npm-cache" > "$out/npm-pack.json"
  ''
