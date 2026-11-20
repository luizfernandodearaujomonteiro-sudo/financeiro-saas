import { stop, testClusterOptions } from "../../scripts/db/cluster";
import { closePools } from "../../src/lib/db/pool";

export async function teardown() {
  await closePools().catch(() => {});
  stop(testClusterOptions()); // para SOMENTE o cluster de teste que nós iniciamos
}
