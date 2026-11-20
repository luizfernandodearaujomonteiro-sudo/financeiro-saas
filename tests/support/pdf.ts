/**
 * Gera PDFs mínimos para testes (texto em Helvetica), opcionalmente protegidos por
 * senha com o "Standard Security Handler" do PDF (RC4 40 bits, V1/R2) — o formato
 * mais simples que leitores de PDF (pdf.js) abrem pedindo senha.
 */
import { createHash } from "node:crypto";

const PAD = Buffer.from("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A", "hex");

function rc4(key: Buffer, data: Buffer): Buffer {
  const S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i]! + key[i % key.length]!) & 255;
    [S[i], S[j]] = [S[j]!, S[i]!];
  }
  const out = Buffer.alloc(data.length);
  let a = 0, b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 255;
    b = (b + S[a]!) & 255;
    [S[a], S[b]] = [S[b]!, S[a]!];
    out[k] = data[k]! ^ S[(S[a]! + S[b]!) & 255]!;
  }
  return out;
}

const md5 = (...parts: Buffer[]) => createHash("md5").update(Buffer.concat(parts)).digest();
const padPw = (pw: string) => Buffer.concat([Buffer.from(pw, "latin1"), PAD]).subarray(0, 32);
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function makePdf(lines: string[], opts: { userPassword?: string; ownerPassword?: string } = {}): Uint8Array {
  const content = Buffer.from(lines.map((l, i) => `BT /F1 10 Tf 50 ${760 - i * 16} Td (${esc(l)}) Tj ET`).join("\n"), "latin1");
  const id = createHash("md5").update(lines.join("|")).digest();
  let streamBytes: Buffer = content;
  let encryptObj = "";
  if (opts.userPassword !== undefined) {
    const P = -4;
    const pBuf = Buffer.alloc(4);
    pBuf.writeInt32LE(P);
    const O = rc4(md5(padPw(opts.ownerPassword ?? `${opts.userPassword}-dono`)).subarray(0, 5), padPw(opts.userPassword));
    const fileKey = md5(padPw(opts.userPassword), O, pBuf, id).subarray(0, 5);
    const U = rc4(fileKey, PAD);
    const objKey = md5(fileKey, Buffer.from([4, 0, 0, 0, 0])).subarray(0, 10); // objeto 4, geração 0
    streamBytes = rc4(objKey, content);
    encryptObj = `<< /Filter /Standard /V 1 /R 2 /O <${O.toString("hex")}> /U <${U.toString("hex")}> /P ${P} >>`;
  }
  const objs: (string | Buffer)[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    Buffer.concat([Buffer.from(`<< /Length ${streamBytes.length} >>\nstream\n`, "latin1"), streamBytes, Buffer.from("\nendstream", "latin1")]),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  if (encryptObj) objs.push(encryptObj);
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let pos = chunks[0]!.length;
  objs.forEach((o, i) => {
    const body = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), typeof o === "string" ? Buffer.from(o, "latin1") : o, Buffer.from("\nendobj\n", "latin1")]);
    offsets.push(pos);
    chunks.push(body);
    pos += body.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  const idHex = id.toString("hex");
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R${encryptObj ? ` /Encrypt ${objs.length} 0 R` : ""} /ID [<${idHex}> <${idHex}>] >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref + trailer, "latin1"));
  return new Uint8Array(Buffer.concat(chunks));
}
