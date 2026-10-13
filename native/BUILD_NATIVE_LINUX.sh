#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
NODE_INCLUDE_DIR="$(dirname "$(dirname "$(readlink -f "$(command -v node)")")")/include/node"
cmake -S . -B .cmake-build -DCMAKE_BUILD_TYPE=Release -DNODE_INCLUDE_DIR="$NODE_INCLUDE_DIR"
cmake --build .cmake-build -j2
mkdir -p build
cp .cmake-build/umbra_crypto.node build/umbra_crypto.node
node -e 'const a=require("./build/umbra_crypto.node"); const k=Buffer.alloc(32),iv=Buffer.alloc(12),msg=Buffer.from("UMBRA native OK"); const x=a.unseal(k,iv,a.seal(k,iv,msg)); if(!x.equals(msg)) process.exit(1);console.log("C++ native AES-256-GCM OK")'
