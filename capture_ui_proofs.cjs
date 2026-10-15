const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
  console.log("=== DÉBUT CAPTURE DES PREUVES VISUELLES DE L'INTERFACE ===");

  const screenshotsDir = path.join(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // 1. Ouvrir la liste des projets
  console.log("1. Navigation vers http://localhost:5173/projects...");
  await page.goto('http://localhost:5173/projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 2. Trouver et ouvrir le projet "Projet Validation Dynamique RH"
  console.log("2. Ouverture de la fiche projet...");
  const projectLink = page.locator('text=Projet Validation Dynamique RH').first();
  if (await projectLink.count() > 0) {
    await projectLink.click();
  } else {
    await page.locator('a[href^="/projects/"]').first().click();
  }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // 3. Ouvrir le modal "Nouveau Use Case"
  console.log("3. Clic sur '+ Nouveau Use Case'...");
  const newUseCaseBtn = page.locator('button:has-text("Nouveau Use Case")').first();
  await newUseCaseBtn.waitFor({ state: 'visible' });
  await newUseCaseBtn.click();
  await page.waitForTimeout(800);

  // 4. Basculer sur Mode Pipeline Chaîné
  console.log("4. Sélection du Mode Pipeline Chaîné...");
  const pipelineModeBtn = page.locator('button:has-text("Mode Pipeline Chaîné")').first();
  await pipelineModeBtn.click();
  await page.waitForTimeout(600);

  // Capture 1 : Modal de création de Use Case en mode Pipeline
  const modalScreenshotPath = path.join(screenshotsDir, 'screenshot_ui_create_usecase_pipeline_modal.png');
  await page.screenshot({ path: modalScreenshotPath });
  console.log("📸 Capture 1 enregistrée :", modalScreenshotPath);

  // 5. Fermer le modal de création
  const cancelBtn = page.locator('button:has-text("Annuler")').first();
  await cancelBtn.click();
  await page.waitForTimeout(800);

  // 6. Exécuter le Use Case Pipeline
  console.log("6. Clic sur 'Exécuter le Use Case' pour le Pipeline...");
  // Chercher la carte contenant "Pipeline"
  const cards = page.locator('.hover\\:shadow-md');
  const cardCount = await cards.count();
  let clicked = false;
  for (let i = 0; i < cardCount; i++) {
    const card = cards.nth(i);
    const text = await card.innerText();
    if (text.includes('Pipeline')) {
      const btn = card.locator('button:has-text("Exécuter le Use Case")');
      if (await btn.count() > 0) {
        await btn.click();
        clicked = true;
        break;
      }
    }
  }
  if (!clicked) {
    await page.locator('button:has-text("Exécuter le Use Case")').first().click();
  }
  await page.waitForTimeout(1200);

  // Remplir le champ de profil
  console.log("7. Saisie des données d'entrée...");
  const allInputs = page.locator('div[role="dialog"] input, div[role="dialog"] textarea');
  const count = await allInputs.count();
  console.log(`Nombre de champs détectés dans la modale : ${count}`);
  for (let i = 0; i < count; i++) {
    const inp = allInputs.nth(i);
    const visible = await inp.isVisible();
    if (visible) {
      await inp.fill("Candidat expert Kubernetes, Docker, CI/CD et observabilité avec 7 ans d'expérience.");
    }
  }

  // Lancer l'exécution
  console.log("8. Clic sur le bouton d'exécution...");
  const executeBtn = page.locator('div[role="dialog"] button:has-text("Exécuter le Use Case")').last();
  await executeBtn.click();

  // Attendre l'affichage du stepper ou du résultat
  console.log("9. Attente de la fin de l'exécution et du Stepper...");
  try {
    await page.locator('text=Restitution Métier').waitFor({ timeout: 25000 });
  } catch (e) {
    console.log("Timeout sur 'Restitution Métier', capture de l'état actuel de la modale...");
  }
  await page.waitForTimeout(1500);

  // Déplier la première étape pour visualiser sa sortie JSON
  const stepButtons = page.locator('button:has-text("Diagnostic Compétences"), button:has-text("Étape 1"), button:has-text("step_1")');
  if (await stepButtons.count() > 0) {
    await stepButtons.first().click();
    await page.waitForTimeout(500);
  }

  // Capture 2 : Stepper d'exécution du Pipeline avec résultat
  const stepperScreenshotPath = path.join(screenshotsDir, 'screenshot_ui_pipeline_execution_stepper.png');
  await page.screenshot({ path: stepperScreenshotPath });
  console.log("📸 Capture 2 enregistrée :", stepperScreenshotPath);

  await browser.close();
  console.log("=== CAPTURES VISUELLES RÉALISÉES AVEC SUCCÈS ===");
}

run().catch((err) => {
  console.error("❌ ERREUR PLAYWRIGHT :", err);
  process.exit(1);
});
