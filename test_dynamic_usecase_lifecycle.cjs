const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("=== TEST DE VALIDATION DU CYCLE DE VIE DES USE CASES (CRÉATION DE ZÉRO) ===");

  const GATEWAY_URL = 'http://localhost:3000';

  // 1. Créer un nouveau projet de test
  const testProject = await prisma.project.create({
    data: {
      name: "Projet Validation Dynamique RH",
      description: "Projet créé de zéro pour tester la création de Use Cases simples et pipelines",
      core_version: "1.0.0",
      modules: "[]"
    }
  });
  console.log("1. Projet créé :", testProject.name, `(${testProject.id})`);

  // 2. Créer un module métier de test
  const testModule = await prisma.module.create({
    data: {
      name: "Module Recrutement & RH",
      module_key: "rh_module",
      version: "1.0.0",
      core_version: "1.0.0",
      category: "RH",
      status: "active",
      lifecycle: "published",
      description: "Module pour héberger les Use Cases RH créés de zéro.",
      features: JSON.stringify([{ key: "recrutement", name: "Recrutement & Talents" }]),
      use_cases: "[]",
      endpoints: "[]"
    }
  });
  console.log("2. Module créé :", testModule.name, `(${testModule.module_key})`);

  // Attacher le module au projet
  await prisma.project.update({
    where: { id: testProject.id },
    data: {
      modules: JSON.stringify([{ module_id: testModule.id, version: "1.0.0", name: testModule.name }])
    }
  });

  // 3. CRÉATION DU USE CASE A : Simple (1 Prompt Direct)
  const ucSimple = {
    key: "screening-candidat",
    name: "Screening Candidat Express",
    description: "Évalue un profil de candidat en 1 prompt direct.",
    type: "standard",
    prompt_name: "screening-candidat",
    instructions: "Tu es un recruteur RH senior. Évalue le profil du candidat : {{input.profil}} et détermine la décision et la séniorité.",
    input_schema: [
      { name: "profil", type: "string", required: true, description: "Description ou CV du candidat" }
    ],
    output_schema: [
      { name: "decision", type: "string", description: "RETENU ou REFUSE" },
      { name: "seniorite", type: "string", description: "JUNIOR, CONFIRME ou SENIOR" },
      { name: "avis", type: "string", description: "Synthèse de l'évaluation" }
    ],
    rag_config: { enabled: false }
  };

  const epSimple = {
    key: "ep_screening_candidat",
    name: "API Screening Candidat",
    description: "Endpoint pour screening candidat",
    method: "POST",
    path: "/rh_module/v1/screening-candidat",
    use_case_key: "rh_module:screening-candidat",
    required_scopes: ["rh_module:screening-candidat"],
    auth_required: false
  };

  // 4. CRÉATION DU USE CASE B : Pipeline (Multi-étapes séquentielles)
  const ucPipeline = {
    key: "onboarding-pipeline",
    name: "Pipeline d'Onboarding & Compétences",
    description: "Chaîne 2 étapes : 1) Détection niveau & compétences, 2) Génération plan d'intégration personnalisé.",
    type: "pipeline",
    output_strategy: "merge_all",
    input_schema: [
      { name: "profil", type: "string", required: true, description: "Profil de la recrue" }
    ],
    steps: [
      {
        step_id: "etape_diagnostic",
        name: "Diagnostic Compétences",
        prompt_template: "Analyse le profil suivant : {{input.profil}}. Retourne le score et le niveau technique estimé.",
        output_schema: [
          { name: "score_technique", type: "number", description: "Score de 0 à 100" },
          { name: "niveau_estime", type: "string", description: "JUNIOR, INTERMEDIAIRE ou EXPERT" }
        ],
        rag_config: { enabled: false }
      },
      {
        step_id: "etape_programme",
        name: "Programme d'Intégration",
        prompt_template: "Le collaborateur a le niveau : {{steps.etape_diagnostic.niveau_estime}}. Rédige un programme d'intégration adapté.",
        output_schema: [
          { name: "programme_semaine_1", type: "string", description: "Activités recommandées semaine 1" },
          { name: "mentor_recommande", type: "string", description: "Profil de mentor assigné" }
        ],
        rag_config: { enabled: false }
      }
    ]
  };

  const epPipeline = {
    key: "ep_onboarding_pipeline",
    name: "API Onboarding Pipeline",
    description: "Endpoint pour pipeline onboarding",
    method: "POST",
    path: "/rh_module/v1/onboarding-pipeline",
    use_case_key: "rh_module:onboarding-pipeline",
    required_scopes: ["rh_module:onboarding-pipeline"],
    auth_required: false
  };

  // Enregistrer les deux Use Cases et leurs Endpoints dans le module
  await prisma.module.update({
    where: { id: testModule.id },
    data: {
      use_cases: JSON.stringify([ucSimple, ucPipeline]),
      endpoints: JSON.stringify([epSimple, epPipeline])
    }
  });
  console.log("3. Use Cases (Simple et Pipeline) enregistrés avec succès dans le module.");

  // Créer le prompt associé pour le Use Case Simple
  await prisma.prompt.create({
    data: {
      name: "screening-candidat",
      use_case: "screening-candidat",
      module_id: testModule.id,
      project_id: testProject.id,
      version: "1.0.0",
      description: "Prompt de screening",
      instructions: ucSimple.instructions,
      status: "active"
    }
  });
  console.log("4. Prompt associé créé dans la table Prompt.");

  // 5. TESTER L'EXÉCUTION DU USE CASE SIMPLE (1 Prompt Direct)
  console.log("\n--- TEST EXÉCUTION USE CASE SIMPLE (/api/dynamic/rh_module/v1/screening-candidat) ---");
  const simpleRes = await fetch(`${GATEWAY_URL}/api/dynamic/rh_module/v1/screening-candidat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': testProject.id,
      'x-project-name': encodeURIComponent(testProject.name)
    },
    body: JSON.stringify({
      profil: "Ingénieur logiciel TypeScript / React / Python avec 6 ans d'expérience dans les systèmes distribués."
    })
  });

  const simpleStatus = simpleRes.status;
  const simpleData = await simpleRes.json();
  console.log("Statut HTTP Use Case Simple :", simpleStatus);
  console.log("Résultat Use Case Simple :", JSON.stringify(simpleData, null, 2));

  if (simpleStatus !== 200 || simpleData.status !== "success") {
    throw new Error(`Échec de l'exécution du Use Case Simple : statut HTTP ${simpleStatus}`);
  }
  console.log("✅ Use Case Simple exécuté avec succès !");

  // 6. TESTER L'EXÉCUTION DU USE CASE PIPELINE (2 étapes chaînées)
  console.log("\n--- TEST EXÉCUTION USE CASE PIPELINE (/api/dynamic/rh_module/v1/onboarding-pipeline) ---");
  const pipelineRes = await fetch(`${GATEWAY_URL}/api/dynamic/rh_module/v1/onboarding-pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-project-id': testProject.id,
      'x-project-name': encodeURIComponent(testProject.name)
    },
    body: JSON.stringify({
      profil: "Nouvelle recrue DevOps spécialisée sur Kubernetes et Terraform."
    })
  });

  const pipelineStatus = pipelineRes.status;
  const pipelineData = await pipelineRes.json();
  console.log("Statut HTTP Use Case Pipeline :", pipelineStatus);
  console.log("Résultat Use Case Pipeline :", JSON.stringify(pipelineData, null, 2));

  if (pipelineStatus !== 200 || pipelineData.status !== "success") {
    throw new Error(`Échec de l'exécution du Use Case Pipeline : statut HTTP ${pipelineStatus}`);
  }

  const metrics = pipelineData.pipeline_metrics || pipelineData._pipeline_metrics;
  if (!metrics || metrics.executed_steps !== 2) {
    throw new Error("Les métriques du pipeline ne contiennent pas les 2 étapes attendues !");
  }
  console.log(`✅ Use Case Pipeline exécuté avec succès ! (${metrics.executed_steps} étapes chaînées validées)`);

  // 7. VÉRIFIER LES EXÉCUTIONS IA ET TRACES D'AUDIT EN BASE DE DONNÉES
  console.log("\n--- VÉRIFICATION AUDIT & EXÉCUTIONS IA EN BASE ---");
  const executions = await prisma.aIExecution.findMany({
    where: { project_id: testProject.id },
    orderBy: { created_date: 'desc' }
  });
  console.log(`Nombre d'exécutions enregistrées pour le projet : ${executions.length}`);
  executions.forEach((e, idx) => {
    console.log(`  [${idx + 1}] Use Case: ${e.use_case} | Statut: ${e.status} | Durée: ${e.execution_time}ms | Prompt: ${e.prompt_name}`);
  });

  const audits = await prisma.auditEvent.findMany({
    where: { project_id: testProject.id },
    orderBy: { created_date: 'desc' }
  });
  console.log(`Nombre d'événements d'audit enregistrés pour le projet : ${audits.length}`);

  if (executions.length < 2 || audits.length < 2) {
    throw new Error("Traçabilité incomplète en base de données !");
  }

  console.log("\n🎉 TEST COMPLET RÉUSSI AVEC SUCCÈS !");
  console.log("La création de Use Cases de zéro (simple et pipeline) et leur exécution dynamique fonctionnent à 100%.");
}

run()
  .catch((err) => {
    console.error("❌ ERREUR LORS DU TEST :", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
