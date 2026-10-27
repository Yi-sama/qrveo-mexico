// 多语言辅助：
//   node scripts/i18n.mjs skeleton          打印需要翻译的西语文字（翻译新语言或补翻时用）
//   node scripts/i18n.mjs missing [en]      打印某种语言没翻译的文字（不写 = 全部语言）
//   node scripts/i18n.mjs check             检查翻译里的 {占位符}、*强调* 是否与西语一致
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, DEFAULT_LANG, missing, skeleton, translatable } from "../src/i18n.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (code) => {
  const f = path.join(ROOT, "content", `${code}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
};
const es = read(DEFAULT_LANG);
const others = LANGS.filter((l) => l.code !== DEFAULT_LANG).map((l) => l.code);
const [cmd, arg] = process.argv.slice(2);

if (cmd === "skeleton") {
  process.stdout.write(`${JSON.stringify(skeleton(es), null, 2)}\n`);
} else if (cmd === "missing") {
  for (const code of arg ? [arg] : others) {
    const list = missing(es, read(code));
    console.log(`${code}: ${list.length} 条未翻译`);
    list.slice(0, 40).forEach((p) => console.log(`  ${p}`));
  }
} else if (cmd === "check") {
  const marks = (s) => [...(s.match(/\{\w+\}/g) || [])].sort().join(" ") + ` *${(s.match(/\*/g) || []).length}`;
  let bad = 0;
  for (const code of others) {
    const tr = read(code);
    const walk = (b, t, p) => {
      if (typeof b === "string") {
        if (translatable(p) && typeof t === "string" && marks(b) !== marks(t)) {
          bad++;
          console.log(`${code} ${p}\n  es: ${b}\n  ${code}: ${t}`);
        }
      } else if (b && typeof b === "object") Object.keys(b).forEach((k) => walk(b[k], t?.[k], Array.isArray(b) ? `${p}[${k}]` : p ? `${p}.${k}` : k));
    };
    walk(es, tr, "");
  }
  console.log(bad ? `${bad} 处不一致` : "占位符和强调标记都一致");
} else {
  console.log("用法：node scripts/i18n.mjs skeleton | missing [code] | check");
}
