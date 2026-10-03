{
  description = "Pinned Darwinian Worker CI tooling";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/774debe7a0d1b496e35677ad955a1011c6ff74f3";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      eachSystem =
        f: nixpkgs.lib.genAttrs systems (system: f system (import nixpkgs { inherit system; }));
      bun_1_2_21 =
        pkgs:
        pkgs.bun.overrideAttrs (
          finalAttrs: previousAttrs: {
            version = "1.2.21";
            src = finalAttrs.passthru.sources.${pkgs.stdenv.hostPlatform.system};
            passthru = previousAttrs.passthru // {
              sources = {
                "x86_64-linux" = pkgs.fetchurl {
                  url = "https://github.com/oven-sh/bun/releases/download/bun-v1.2.21/bun-linux-x64.zip";
                  hash = "sha256-WU9FTVHOVxmdQyDIXL1JW+nAVO8XquvKXmyQir/aYXk=";
                };
                "aarch64-darwin" = pkgs.fetchurl {
                  url = "https://github.com/oven-sh/bun/releases/download/bun-v1.2.21/bun-darwin-aarch64.zip";
                  hash = "sha256-/YhmMLoVxIQjatXz8islXSh8Pu+NO8JvyAmFEDXATOw=";
                };
                "x86_64-darwin" = pkgs.fetchurl {
                  url = "https://github.com/oven-sh/bun/releases/download/bun-v1.2.21/bun-darwin-x64-baseline.zip";
                  hash = "sha256-Qm1N3h5Rg0aNMf+G7RPAjW8p7wlcia5QtfX1IP3u2RY=";
                };
              };
            };
          }
        );
    in
    {
      devShells = eachSystem (
        _system: pkgs: {
          default = pkgs.mkShell {
            packages = [
              (bun_1_2_21 pkgs)
              pkgs.nodejs_24
              pkgs.git
              pkgs.jq
              pkgs.shellcheck
              pkgs.curl
            ];
          };
        }
      );

      checks = eachSystem (
        _system: pkgs: {
          toolchain =
            pkgs.runCommand "darwinian-worker-toolchain-check"
              {
                nativeBuildInputs = [
                  (bun_1_2_21 pkgs)
                  pkgs.nodejs_24
                ];
              }
              ''
                test "$(bun --version)" = "1.2.21"
                test "$(node --version)" = "v24.21.0"
                test "$(npm --version)" = "11.19.0"
                touch "$out"
              '';
        }
      );

      formatter = eachSystem (_system: pkgs: pkgs.nixfmt);
    };
}
