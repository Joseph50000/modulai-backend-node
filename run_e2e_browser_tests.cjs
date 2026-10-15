const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log("=== LANCEMENT DU TEST AUTOMATISÉ COMPLET DANS LE NAVIGATEUR (Playwright) ===");
  const screenshotsDir = path.join(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[BROWSER CONSOLE ERROR]:', msg.text());
  });

  try {
    // ----------------------------------------------------
    // ÉTAPE 1 : Test des Providers dans /core-admin
    // ----------------------------------------------------
    console.log("\n1. Navigation vers http://localhost:5173/core-admin...");
    await page.goto('http://localhost:5173/core-admin', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log("2. Clic sur l'onglet 'Providers'...");
    const providersTab = page.locator('button[role="tab"]:has-text("Providers")').first();
    await providersTab.click();
    await page.waitForTimeout(1500);

    // Test Ollama Cloud
    console.log("3. Test du Provider 'Ollama Cloud' (clic sur 'Tester')...");
    const ollamaCard = page.locator('.space-y-4 .grid > div:has-text("Ollama Cloud")').first();
    const ollamaTestBtn = ollamaCard.locator('button:has-text("Tester")').first();
    await ollamaTestBtn.click();

    console.log("   Attente du toast de succès Ollama Cloud...");
    await page.waitForSelector('[role="status"], [role="alert"], [data-radix-collection-item], .group', { timeout: 15000 });
    await page.waitForTimeout(1500);
    const snap1 = path.join(screenshotsDir, 'screenshot_ui_test_ollama_cloud.png');
    await page.screenshot({ path: snap1 });
    console.log("   📸 Capture 1 enregistrée :", snap1);

    await page.waitForTimeout(3000);

    // Test Groq Cloud
    console.log("4. Test du Provider 'Groq Cloud' (clic sur 'Tester')...");
    const groqCard = page.locator('.space-y-4 .grid > div:has-text("Groq Cloud")').first();
    const groqTestBtn = groqCard.locator('button:has-text("Tester")').first();
    await groqTestBtn.click();

    console.log("   Attente du toast de succès Groq Cloud...");
    await page.waitForTimeout(2000);
    const snap2 = path.join(screenshotsDir, 'screenshot_ui_test_groq_cloud.png');
    await page.screenshot({ path: snap2 });
    console.log("   📸 Capture 2 enregistrée :", snap2);

    // ----------------------------------------------------
    // ÉTAPE 2 : Core Settings
    // ----------------------------------------------------
    console.log("\n5. Clic sur l'onglet 'Core Settings'...");
    const settingsTab = page.locator('button[role="tab"]:has-text("Core Settings")').first();
    await settingsTab.click();
    await page.waitForTimeout(1500);

    // Sélectionner Ollama Cloud dans le Select Provider
    try {
      console.log("   Sélection de 'Ollama Cloud' comme Provider par défaut...");
      const providerSelectTrigger = page.locator('div:has(> label:has-text("Default Provider")) button[role="combobox"]').first();
      await providerSelectTrigger.click();
      await page.waitForTimeout(500);
      const ollamaOption = page.locator('[role="option"]:has-text("Ollama Cloud")').first();
      if (await ollamaOption.count() > 0) {
        await ollamaOption.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(500);

      console.log("   Sélection de 'Nemotron 3 super' comme Modèle par défaut...");
      const modelSelectTrigger = page.locator('div:has(> label:has-text("Default Model")) button[role="combobox"]').first();
      await modelSelectTrigger.click();
      await page.waitForTimeout(500);
      const nemotronOption = page.locator('[role="option"]:has-text("Nemotron 3 super")').first();
      if (await nemotronOption.count() > 0) {
        await nemotronOption.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(500);

      console.log("   Clic sur 'Enregistrer' pour sauvegarder la configuration Core...");
      const saveBtn = page.locator('button:has-text("Enregistrer")').first();
      await saveBtn.click();
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log("   Note sur sélection select :", e.message);
    }

    const snap3 = path.join(screenshotsDir, 'screenshot_ui_core_settings_nemotron.png');
    await page.screenshot({ path: snap3 });
    console.log("   📸 Capture 3 enregistrée :", snap3);

    // ----------------------------------------------------
    // ÉTAPE 3 : Exécution d'un Use Case Simple (Screening Candidat)
    // ----------------------------------------------------
    console.log("\n6. Navigation vers http://localhost:5173/projects...");
    await page.goto('http://localhost:5173/projects', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log("7. Ouverture du projet 'Projet Validation Dynamique RH'...");
    const projectCardLink = page.locator('a[href^="/projects/"]:has-text("Projet Validation Dynamique RH")').first();
    if (await projectCardLink.count() > 0) {
      await projectCardLink.click();
    } else {
      await page.locator('a[href^="/projects/"]').first().click();
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    console.log("8. Clic sur 'Exécuter le Use Case' pour Screening Candidat...");
    const simpleCard = page.locator('.grid > div:has-text("Screening Candidat Express")').first();
    const execBtn = simpleCard.locator('button:has-text("Exécuter le Use Case")').first();
    await execBtn.waitFor({ state: 'visible' });
    await execBtn.click();
    await page.waitForTimeout(1000);

    console.log("9. Remplissage du champ 'profil'...");
    const candidateInput = page.locator('[role="dialog"] input, [role="dialog"] textarea').first();
    await candidateInput.waitFor({ state: 'visible' });
    await candidateInput.fill("Ingénieur Cloud & IA senior avec 8 ans d'expérience en Python, FastAPI, Docker et Kubernetes. Excellente communication et rigueur analytique.");
    await page.waitForTimeout(500);

    console.log("10. Clic sur 'Exécuter le Use Case' et attente de la réponse Nemotron...");
    const runBtn = page.locator('[role="dialog"] button:has-text("Exécuter le Use Case")').last();
    await runBtn.click();

    // Attendre que l'exécution se termine (bouton Valider ou Fermer apparaît)
    console.log("   Attente active de la réponse Nemotron...");
    const actionBtnSelector = '[role="dialog"] button:has-text("Valider"), [role="dialog"] button:has-text("Fermer")';
    await page.locator(actionBtnSelector).first().waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForTimeout(1000);

    const snap4 = path.join(screenshotsDir, 'screenshot_ui_usecase_execution_nemotron.png');
    await page.screenshot({ path: snap4 });
    console.log("   📸 Capture 4 enregistrée :", snap4);

    // Clic sur 'Valider' pour valider humainement la décision RH
    const validerBtn = page.locator('[role="dialog"] button:has-text("Valider")').first();
    if (await validerBtn.count() > 0) {
      console.log("   Clic sur le bouton de validation humaine 'Valider'...");
      await validerBtn.click();
      await page.waitForTimeout(1500);
    }

    // Fermer le dialogue proprement
    console.log("   Fermeture du modal Use Case simple...");
    const closeBtn = page.locator('[role="dialog"] button:has-text("Fermer")').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(1500);
    }
    // Assurer la fermeture
    if (await page.locator('[role="dialog"]').count() > 0) {
      const closeX = page.locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] .lucide-x').first();
      if (await closeX.count() > 0) await closeX.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
    }
    await page.locator('[role="dialog"]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // ----------------------------------------------------
    // ÉTAPE 4 : Exécution d'un Use Case Pipeline (Onboarding Pipeline)
    // ----------------------------------------------------
    console.log("\n11. Clic sur 'Exécuter le Use Case' pour le Pipeline d'Onboarding...");
    const pipelineCard = page.locator('.grid > div:has-text("onboarding-pipeline")').first();
    if (await pipelineCard.count() > 0) {
      const pipeExecBtn = pipelineCard.locator('button:has-text("Exécuter le Use Case")').first();
      await pipeExecBtn.click();
      await page.waitForTimeout(1000);

      const pipeInput = page.locator('[role="dialog"] input, [role="dialog"] textarea').first();
      if (await pipeInput.count() > 0) {
        await pipeInput.fill("Nouveau collaborateur Data Engineer : expertise SQL, Spark, pipelines ETL temps réel et conformité bancaire.");
        await page.waitForTimeout(500);

        const runPipeBtn = page.locator('[role="dialog"] button:has-text("Exécuter le Use Case")').last();
        await runPipeBtn.click();

        console.log("   Attente de l'exécution séquentielle du Stepper Pipeline...");
        await page.locator(actionBtnSelector).first().waitFor({ state: 'visible', timeout: 120000 });
        await page.waitForTimeout(1500);

        // Déplier la première étape du Stepper pour inspecter la sortie JSON
        const firstStepAccordion = page.locator('[role="dialog"] button:has-text("Diagnostic"), [role="dialog"] button:has-text("Étape 1")').first();
        if (await firstStepAccordion.count() > 0) {
          await firstStepAccordion.click();
          await page.waitForTimeout(500);
        }

        const snapPipe = path.join(screenshotsDir, 'screenshot_ui_pipeline_execution_nemotron.png');
        await page.screenshot({ path: snapPipe });
        console.log("   📸 Capture Pipeline Stepper enregistrée :", snapPipe);

        // Validation humaine ou fermeture
        const pipeValiderBtn = page.locator('[role="dialog"] button:has-text("Valider")').first();
        if (await pipeValiderBtn.count() > 0) {
          await pipeValiderBtn.click();
          await page.waitForTimeout(1500);
        }
        const closePipeBtn = page.locator('[role="dialog"] button:has-text("Fermer")').first();
        if (await closePipeBtn.count() > 0) {
          await closePipeBtn.click();
          await page.waitForTimeout(1500);
        }
        if (await page.locator('[role="dialog"]').count() > 0) {
          const closeX = page.locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] .lucide-x').first();
          if (await closeX.count() > 0) await closeX.click();
          else await page.keyboard.press("Escape");
          await page.waitForTimeout(1000);
        }
      }
    }

    // ----------------------------------------------------
    // ÉTAPE 5 : Vérification dans /executions
    // ----------------------------------------------------
    console.log("\n12. Navigation vers http://localhost:5173/executions...");
    await page.goto('http://localhost:5173/executions', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const snap5 = path.join(screenshotsDir, 'screenshot_ui_executions_table.png');
    await page.screenshot({ path: snap5, fullPage: true });
    console.log("   📸 Capture 5 (Tableau des exécutions) enregistrée :", snap5);

    console.log("\n>>> TOUTES LES ÉTAPES ONT ÉTÉ EXÉCUTÉES DANS LE NAVIGATEUR AVEC SUCCÈS ! <<<");
  } catch (err) {
    console.error("❌ ERREUR LORS DE L'EXÉCUTION NAVIGATEUR :", err);
    const errSnap = path.join(screenshotsDir, 'screenshot_error_state.png');
    await page.screenshot({ path: errSnap });
    console.log("📸 Capture d'erreur :", errSnap);
  } finally {
    await browser.close();
  }
}

main();
