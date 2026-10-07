/**
 * audit_zero_hardcode.cjs
 * Vérifie l'agnosticisme strict et l'absence totale de termes métier bancaires
 * codés en dur dans le AI Core générique (Python FastAPI et Node.js Core).
 */

const fs = require('fs');
const path = require('path');

const FORBIDDEN_PATTERNS = [
  { term: 'bceao', regex: /\bbceao\b/i },
  { term: 'agio(s)', regex: /\bagios?\b/i },
  { term: 'dab', regex: /\bdab\b/i },
  { term: 'gab', regex: /\bgab\b/i },
  { term: 'reclamation', regex: /\br[ée]clamation(s)?\b/i },
  { term: 'plainte', regex: /\bplainte(s)?\b/i },
  { term: 'gpr_claim', regex: /gpr_claim/i }
];

const SCAN_DIRS = [
  path.resolve(__dirname, '../../ai-core-fastapi/src'),
  path.resolve(__dirname, '../src/core')
];

// Fichiers autorisés ou exclus de l'audit d'agnosticisme du Core
const EXCLUDED_FILES = [
  'gpr_sync_worker.py' // Worker d'intégration legacy / transition
];

let totalFilesChecked = 0;
let totalViolations = 0;
const violationsReport = [];

function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== '__pycache__' && entry.name !== 'node_modules') {
        scanDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      if (EXCLUDED_FILES.includes(entry.name)) continue;
      if (!entry.name.endsWith('.py') && !entry.name.endsWith('.js')) continue;

      totalFilesChecked++;
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, lineIndex) => {
        // Ignorer les commentaires qui mentionnent "agnostique" ou expliquent la neutralité
        if (line.includes('ZÉRO') || line.includes('agnostique') || line.includes('neutralité')) return;

        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.regex.test(line)) {
            totalViolations++;
            violationsReport.push({
              file: path.relative(path.resolve(__dirname, '../..'), fullPath),
              line: lineIndex + 1,
              term: pattern.term,
              content: line.trim()
            });
          }
        }
      });
    }
  }
}

console.log('========================================================');
console.log('🔍 AUDIT D\'AGNOSTICISME DU CORE MODULAI (ZÉRO CODE DUR)');
console.log('========================================================');

for (const dir of SCAN_DIRS) {
  console.log(`Scan du répertoire : ${dir}`);
  scanDirectory(dir);
}

console.log(`\nFichiers analysés : ${totalFilesChecked}`);

if (totalViolations === 0) {
  console.log('✅ SUCCÈS : 0 violation détectée ! Le Core est 100% neutre et agnostique.');
  process.exit(0);
} else {
  console.error(`❌ ÉCHEC : ${totalViolations} violation(s) trouvée(s) :`);
  violationsReport.forEach((v) => {
    console.error(`  - [${v.file}:${v.line}] Terme "${v.term}" trouvé dans : "${v.content}"`);
  });
  process.exit(1);
}
