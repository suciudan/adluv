import assert from "node:assert/strict";
import { test } from "node:test";

import { detectDisplayLanguage } from "./repositories";

test("detectDisplayLanguage identifies French Databricks ad copy", () => {
  assert.equal(
    detectDisplayLanguage(
      [
        "Étude MIT Tech Review",
        "Les DSI d’entreprises leaders comme Adobe, Shell et DuPont font le point sur l’IA générative dans un nouveau rapport MIT.",
        "Download",
      ].join("\n"),
    ),
    "French",
  );
});

test("detectDisplayLanguage identifies French Semrush ad copy", () => {
  assert.equal(
    detectDisplayLanguage(
      [
        "Réalisez un audit complet du site web",
        "Vous voulez de meilleurs classements ? Faites un audit de votre site pour trouver et résoudre les problèmes de SEO technique",
        "Learn More",
      ].join("\n"),
    ),
    "French",
  );
});

test("detectDisplayLanguage identifies Portuguese Databricks ad copy", () => {
  assert.equal(
    detectDisplayLanguage(
      [
        "Aprenda com líderes do setor",
        "Sua estratégia de dados está acompanhando o ritmo? Descubra como liderar equipes de dados de alta performance e gerar resultados com IA.",
        "Download",
      ].join("\n"),
    ),
    "Portuguese",
  );
});

test("detectDisplayLanguage identifies Portuguese Azure ad copy instead of French", () => {
  assert.equal(
    detectDisplayLanguage(
      [
        "Crie uma conta gratuita do Azure",
        "Escale suas aplicações, reduza custos e otimize a performance com os serviços mensais gratuitos do Azure.",
        "Sign up",
      ].join("\n"),
    ),
    "Portuguese",
  );
});

test("detectDisplayLanguage preserves Spanish detection", () => {
  assert.equal(
    detectDisplayLanguage(
      [
        "Haz una auditoría web completa",
        "¿Quieres posicionar mejor? Haz una auditoría web para encontrar y solucionar los problemas de SEO técnico que te frenan.",
        "Learn More",
      ].join("\n"),
    ),
    "Spanish",
  );
});

test("detectDisplayLanguage keeps plain English copy as English", () => {
  assert.equal(
    detectDisplayLanguage("Run a complete website audit\nFind and fix site issues.\nLearn More"),
    "English",
  );
});
