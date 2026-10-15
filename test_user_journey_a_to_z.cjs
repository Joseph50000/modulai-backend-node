const { chromium } = require('playwright');
const path = require('path');

async function testUserJourney() {
  console.log("=== VÉRIFICATION DU PARCOURS UTILISATEUR DE A À Z ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
  });

  // 1. L'utilisateur va sur Projects
  console.log("1. Accès à /projects...");
  await page.goto('http://localhost:5173/projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 2. L'utilisateur clique sur "Nouveau projet"
  console.log("2. Clic sur 'Nouveau projet'...");
  await page.locator('button:has-text("Nouveau projet")').first().click();
  await page.waitForTimeout(500);

  // Saisir le nom du projet
  const projName = "Mon Projet Test " + Math.random().toString(36).slice(2, 6).toUpperCase();
  await page.locator('input[id^="pname"], input[placeholder="Fraud Detection Platform"]').fill(projName);
  await page.locator('textarea[id^="pdesc"], textarea[placeholder="Application pour"]').fill("Projet créé par l'utilisateur de A à Z.");
  
  // Cliquer sur Créer le projet
  await page.locator('button:has-text("Créer le projet")').click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  console.log(`✅ Projet créé avec succès : ${projName}`);

  // 3. L'utilisateur clique sur "+ Nouveau Use Case"
  console.log("3. Clic sur '+ Nouveau Use Case'...");
  await page.locator('button:has-text("Nouveau Use Case"), button:has-text("Créer un Use Case de zéro")').first().click();
  await page.waitForTimeout(800);

  // 4. L'utilisateur choisit Pipeline Chaîné et remplit
  console.log("4. Configuration d'un Pipeline dans la modale...");
  await page.locator('button:has-text("Mode Pipeline Chaîné")').click();
  await page.waitForTimeout(400);

  await page.locator('#uc-name').fill("Audit Contrat Intelligent");
  await page.locator('#uc-desc').fill("Analyse un contrat en 2 étapes séquentielles.");

  // Valider la création
  console.log("5. Clic sur 'Créer et Activer le Use Case'...");
  await page.locator('button:has-text("Créer et Activer le Use Case")').click();
  await page.waitForTimeout(2000);

  // 6. Vérifier que la carte est visible sur la page
  console.log("6. Vérification de la carte Use Case sur la page du projet...");
  const useCaseCard = page.locator('h3:has-text("Audit Contrat Intelligent")');
  await useCaseCard.waitFor({ timeout: 10000 });
  console.log("✅ Carte Use Case bien affichée sur la page du projet !");

  // 7. L'utilisateur clique sur "Exécuter le Use Case"
  console.log("7. Clic sur 'Exécuter le Use Case'...");
  const cardContainer = page.locator('div:has(> div > h3:has-text("Audit Contrat Intelligent"))').first();
  await cardContainer.locator('button:has-text("Exécuter le Use Case")').click();
  await page.waitForTimeout(1000);

  // Saisir du texte dans le formulaire d'entrée
  console.log("8. Saisie des données d'entrée...");
  const inputElem = page.locator('div[role="dialog"] input, div[role="dialog"] textarea').first();
  await inputElem.fill("Contrat de prestation informatique de 12 mois avec clause de non-concurrence.");

  // Lancer l'exécution
  console.log("9. Lancement de l'exécution du Use Case...");
  await page.locator('div[role="dialog"] button:has-text("Exécuter le Use Case")').last().click();

  // Attendre le résultat
  await page.locator('text=Restitution Métier').waitFor({ timeout: 30000 });
  console.log("✅ Résultat obtenu avec succès et affiché dans l'interface !");

  await browser.close();
  console.log("🎉 PARCOURS UTILISATEUR DE A À Z 100% FONCTIONNEL ET VALIDÉ !");
}

testUserJourney().catch(err => {
  console.error("❌ ERREUR PARCOURS :", err);
  process.exit(1);
});
