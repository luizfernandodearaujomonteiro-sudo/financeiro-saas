import { teardown } from "./global-teardown";

// Garante que o cluster de TESTE seja parado ao fim (somente o nosso).
export default function setup() {
  return teardown;
}
