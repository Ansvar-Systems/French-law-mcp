#!/usr/bin/env tsx
/**
 * Ingestion pipeline for French Law MCP.
 *
 * Fetches French legislation from DILA open data / PISTE API and produces
 * seed JSON files in data/seed/.
 *
 * Usage:
 *   npm run ingest                     # Ingest all configured codes
 *   npm run ingest -- --limit 2        # Ingest only first 2 codes
 *   npm run ingest -- --code code-penal # Ingest a specific code
 *   npm run ingest -- --seed-only      # Skip fetching, just write manual seeds
 *
 * Strategy:
 *   1. Try PISTE sandbox API for each code
 *   2. If unavailable, fall back to Legifrance HTML scraping for key articles
 *   3. If all remote fetching fails, write manual seed data (always succeeds)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchFromPisteSandbox, fetchArticleFromLegifrance, type FetchedArticle } from './lib/fetcher.js';
import { normalizeArticleNum, articleTitle } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.resolve(__dirname, '../data/seed');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { limit?: number; code?: string; seedOnly: boolean } {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let code: string | undefined;
  let seedOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--code' && args[i + 1]) {
      code = args[i + 1];
      i++;
    } else if (args[i] === '--seed-only') {
      seedOnly = true;
    }
  }

  return { limit, code, seedOnly };
}

// ---------------------------------------------------------------------------
// Code configurations — key French cybersecurity/data protection legislation
// ---------------------------------------------------------------------------

interface CodeConfig {
  id: string;
  name: string;
  nameFr: string;
  pisteTextId?: string;         // LEGI text ID for PISTE API
  legifranceUrl: string;
  /** Specific article ranges to fetch (section IDs on Legifrance) */
  articleIds?: string[];
  /** Manual seed data as fallback */
  manualSeed: SeedDocument;
}

interface SeedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

interface SeedDocument {
  id: string;
  type: 'statute';
  title: string;
  title_en?: string;
  short_name?: string;
  status: 'in_force' | 'amended' | 'repealed';
  issued_date?: string;
  in_force_date?: string;
  url: string;
  description?: string;
  provisions: SeedProvision[];
}

// ---------------------------------------------------------------------------
// Manual seed data — authoritative text of key French cyber/data laws
// ---------------------------------------------------------------------------

const CODE_CONFIGS: CodeConfig[] = [
  {
    id: 'code-penal-cyber',
    name: 'Criminal Code - Offences against automated data processing systems',
    nameFr: 'Code penal - Atteintes aux systemes de traitement automatise de donnees',
    pisteTextId: 'LEGITEXT000006070719',
    legifranceUrl: 'https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006149839/',
    manualSeed: {
      id: 'code-penal-cyber',
      type: 'statute',
      title: 'Code penal - Atteintes aux systemes de traitement automatise de donnees',
      title_en: 'Criminal Code - Offences against automated data processing systems',
      short_name: 'Code penal (STAD)',
      status: 'in_force',
      issued_date: '1994-03-01',
      in_force_date: '1994-03-01',
      url: 'https://www.legifrance.gouv.fr/codes/id/LEGISCTA000006149839/',
      description: 'Articles 323-1 to 323-8 of the French Criminal Code penalize unauthorized access, modification, and obstruction of automated data processing systems (STAD). These are the core cybercrime provisions in French law.',
      provisions: [
        {
          provision_ref: 'art323-1',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-1',
          title: 'Article 323-1',
          content: 'Le fait d\'acceder ou de se maintenir, frauduleusement, dans tout ou partie d\'un systeme de traitement automatise de donnees est puni de trois ans d\'emprisonnement et de 100 000 euros d\'amende.\n\nLorsqu\'il en est resulte soit la suppression ou la modification de donnees contenues dans le systeme, soit une alteration du fonctionnement de ce systeme, la peine est de cinq ans d\'emprisonnement et de 150 000 euros d\'amende.\n\nLorsque les infractions prevues aux deux premiers alineas ont ete commises a l\'encontre d\'un systeme de traitement automatise de donnees a caractere personnel mis en oeuvre par l\'Etat, la peine est portee a sept ans d\'emprisonnement et a 300 000 euros d\'amende.',
        },
        {
          provision_ref: 'art323-2',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-2',
          title: 'Article 323-2',
          content: 'Le fait d\'entraver ou de fausser le fonctionnement d\'un systeme de traitement automatise de donnees est puni de cinq ans d\'emprisonnement et de 150 000 euros d\'amende.\n\nLorsque cette infraction a ete commise a l\'encontre d\'un systeme de traitement automatise de donnees a caractere personnel mis en oeuvre par l\'Etat, la peine est portee a sept ans d\'emprisonnement et a 300 000 euros d\'amende.',
        },
        {
          provision_ref: 'art323-3',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-3',
          title: 'Article 323-3',
          content: 'Le fait d\'introduire frauduleusement des donnees dans un systeme de traitement automatise, d\'extraire, de detenir, de reproduire, de transmettre, de supprimer ou de modifier frauduleusement les donnees qu\'il contient est puni de cinq ans d\'emprisonnement et de 150 000 euros d\'amende.\n\nLorsque cette infraction a ete commise a l\'encontre d\'un systeme de traitement automatise de donnees a caractere personnel mis en oeuvre par l\'Etat, la peine est portee a sept ans d\'emprisonnement et a 300 000 euros d\'amende.',
        },
        {
          provision_ref: 'art323-3-1',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-3-1',
          title: 'Article 323-3-1',
          content: 'Le fait, sans motif legitime, notamment de recherche ou de securite informatique, d\'importer, de detenir, d\'offrir, de ceder ou de mettre a disposition un equipement, un instrument, un programme informatique ou toute donnee concus ou specialement adaptes pour commettre une ou plusieurs des infractions prevues par les articles 323-1 a 323-3 est puni des peines prevues respectivement pour l\'infraction elle-meme ou pour l\'infraction la plus severement reprimee.',
        },
        {
          provision_ref: 'art323-4',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-4',
          title: 'Article 323-4',
          content: 'La participation a un groupement forme ou a une entente etablie en vue de la preparation, caracterisee par un ou plusieurs faits materiels, d\'une ou de plusieurs des infractions prevues par les articles 323-1 a 323-3-1 est punie des peines prevues pour l\'infraction elle-meme ou pour l\'infraction la plus severement reprimee.',
        },
        {
          provision_ref: 'art323-4-1',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-4-1',
          title: 'Article 323-4-1',
          content: 'Lorsque les infractions prevues aux articles 323-1 a 323-3-1 ont ete commises en bande organisee et a l\'encontre d\'un systeme de traitement automatise de donnees a caractere personnel mis en oeuvre par l\'Etat, la peine est portee a dix ans d\'emprisonnement et a 300 000 euros d\'amende.',
        },
        {
          provision_ref: 'art323-5',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-5',
          title: 'Article 323-5',
          content: 'Les personnes physiques coupables des delits prevus au present chapitre encourent egalement les peines complementaires suivantes :\n1) L\'interdiction, pour une duree de cinq ans au plus, des droits civiques, civils et de famille, suivant les modalites prevues par l\'article 131-26 ;\n2) L\'interdiction, pour une duree de cinq ans au plus, d\'exercer une fonction publique ou d\'exercer l\'activite professionnelle ou sociale dans l\'exercice de laquelle ou a l\'occasion de l\'exercice de laquelle l\'infraction a ete commise ;\n3) La confiscation de la chose qui a servi ou etait destinee a commettre l\'infraction ou de la chose qui en est le produit, a l\'exception des objets susceptibles de restitution ;\n4) La fermeture, pour une duree de cinq ans au plus, des etablissements ou de l\'un ou de plusieurs des etablissements de l\'entreprise ayant servi a commettre les faits incrimines ;\n5) L\'exclusion, pour une duree de cinq ans au plus, des marches publics ;\n6) L\'interdiction, pour une duree de cinq ans au plus, d\'emettre des cheques autres que ceux qui permettent le retrait de fonds par le tireur aupres du tire ou ceux qui sont certifies ;\n7) L\'affichage ou la diffusion de la decision prononcee dans les conditions prevues par l\'article 131-35.',
        },
        {
          provision_ref: 'art323-6',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-6',
          title: 'Article 323-6',
          content: 'Les personnes morales declarees responsables penalement, dans les conditions prevues par l\'article 121-2, des infractions definies au present chapitre encourent, outre l\'amende suivant les modalites prevues par l\'article 131-38 :\n1) Les peines mentionnees a l\'article 131-39 ;\n2) La peine prevue au 9) de l\'article 131-39.',
        },
        {
          provision_ref: 'art323-7',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-7',
          title: 'Article 323-7',
          content: 'La tentative des delits prevus par les articles 323-1 a 323-3-1 est punie des memes peines.',
        },
        {
          provision_ref: 'art323-8',
          chapter: 'Livre III, Titre II, Chapitre III',
          section: '323-8',
          title: 'Article 323-8',
          content: 'Le present chapitre n\'est pas applicable aux mesures mises en oeuvre, par les agents habilites des services de l\'Etat designes par arrete du Premier ministre parmi les services specialises de renseignement mentionnes a l\'article L. 811-2 du code de la securite interieure, pour assurer hors du territoire national la protection des interets fondamentaux de la Nation mentionnes a l\'article L. 811-3 du meme code.',
        },
      ],
    },
  },
  {
    id: 'loi-informatique-libertes',
    name: 'Data Protection Act (Loi Informatique et Libertes)',
    nameFr: 'Loi n 78-17 du 6 janvier 1978 relative a l\'informatique, aux fichiers et aux libertes',
    pisteTextId: 'LEGITEXT000006068624',
    legifranceUrl: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000886460/',
    manualSeed: {
      id: 'loi-informatique-libertes',
      type: 'statute',
      title: 'Loi n 78-17 du 6 janvier 1978 relative a l\'informatique, aux fichiers et aux libertes',
      title_en: 'Act No. 78-17 of 6 January 1978 on Information Technology, Data Files and Civil Liberties',
      short_name: 'Loi Informatique et Libertes',
      status: 'in_force',
      issued_date: '1978-01-06',
      in_force_date: '1978-01-06',
      url: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000886460/',
      description: 'France\'s foundational data protection law, extensively amended to implement the GDPR. Establishes the CNIL (Commission nationale de l\'informatique et des libertes) and governs processing of personal data.',
      provisions: [
        {
          provision_ref: 'art1',
          section: '1',
          title: 'Article 1',
          content: 'L\'informatique doit etre au service de chaque citoyen. Son developpement doit s\'operer dans le cadre de la cooperation internationale. Elle ne doit porter atteinte ni a l\'identite humaine, ni aux droits de l\'homme, ni a la vie privee, ni aux libertes individuelles ou publiques.\n\nToute personne dispose du droit de decider et de controler les usages qui sont faits des donnees a caractere personnel la concernant, dans les conditions fixees par la presente loi.',
        },
        {
          provision_ref: 'art2',
          section: '2',
          title: 'Article 2',
          content: 'La presente loi s\'applique aux traitements automatises en tout ou partie de donnees a caractere personnel, ainsi qu\'aux traitements non automatises de donnees a caractere personnel contenues ou appelees a figurer dans des fichiers, a l\'exception des traitements mis en oeuvre pour l\'exercice d\'activites exclusivement personnelles, lorsque leur responsable remplit les conditions prevues a l\'article 5.',
        },
        {
          provision_ref: 'art8',
          chapter: 'Titre Ier',
          section: '8',
          title: 'Article 8 - CNIL',
          content: 'La Commission nationale de l\'informatique et des libertes est une autorite administrative independante. Elle exerce les missions suivantes :\n1) Elle informe toutes les personnes concernees et tous les responsables de traitements de leurs droits et obligations ;\n2) Elle veille a ce que les traitements de donnees a caractere personnel soient mis en oeuvre conformement aux dispositions de la presente loi et aux autres dispositions relatives a la protection des donnees personnelles prevues par les textes legislatifs et reglementaires, le droit de l\'Union europeenne et les engagements internationaux de la France.',
        },
        {
          provision_ref: 'art20',
          chapter: 'Titre Ier',
          section: '20',
          title: 'Article 20 - Pouvoirs de sanction de la CNIL',
          content: 'Lorsque le responsable de traitement ou son sous-traitant ne respecte pas les obligations decoulant du reglement (UE) 2016/679 du 27 avril 2016 ou de la presente loi, le president de la Commission nationale de l\'informatique et des libertes peut, si le manquement constate est susceptible de faire l\'objet d\'une mise en conformite, prononcer a son egard une mise en demeure, dans le delai qu\'il fixe, de :\n1) Satisfaire aux demandes presentees par la personne concernee en vue d\'exercer ses droits ;\n2) Mettre les operations de traitement en conformite avec les dispositions applicables ;\n3) Communiquer a la personne concernee une violation de donnees a caractere personnel ;\n4) Rectifier ou effacer des donnees a caractere personnel, ou limiter le traitement de ces donnees.',
        },
        {
          provision_ref: 'art83',
          chapter: 'Titre II',
          section: '83',
          title: 'Article 83 - Transferts de donnees',
          content: 'Le responsable d\'un traitement ne peut transferer des donnees a caractere personnel vers un Etat n\'appartenant pas a l\'Union europeenne ou a une organisation internationale que si cet Etat ou cette organisation assure un niveau de protection suffisant de la vie privee et des libertes et droits fondamentaux des personnes a l\'egard du traitement dont ces donnees font l\'objet ou peuvent faire l\'objet.',
        },
        {
          provision_ref: 'art226-16',
          chapter: 'Dispositions penales',
          section: '226-16',
          title: 'Article 226-16 - Sanctions penales',
          content: 'Le fait, y compris par negligence, de proceder ou de faire proceder a des traitements de donnees a caractere personnel sans qu\'aient ete respectees les formalites prealables a leur mise en oeuvre prevues par la loi est puni de cinq ans d\'emprisonnement et de 300 000 euros d\'amende.',
        },
      ],
    },
  },
  {
    id: 'code-defense-cyber',
    name: 'Defence Code - Critical infrastructure and cybersecurity (ANSSI)',
    nameFr: 'Code de la defense - Securite des systemes d\'information',
    pisteTextId: 'LEGITEXT000006071307',
    legifranceUrl: 'https://www.legifrance.gouv.fr/codes/id/LEGISCTA000025508842/',
    manualSeed: {
      id: 'code-defense-cyber',
      type: 'statute',
      title: 'Code de la defense - Securite des activites d\'importance vitale et systemes d\'information',
      title_en: 'Defence Code - Security of activities of vital importance and information systems',
      short_name: 'Code de la defense (cyber)',
      status: 'in_force',
      url: 'https://www.legifrance.gouv.fr/codes/id/LEGISCTA000025508842/',
      description: 'Provisions of the French Defence Code relevant to cybersecurity, including ANSSI\'s mandate, critical infrastructure protection (OIV - Operateurs d\'Importance Vitale), and notification obligations.',
      provisions: [
        {
          provision_ref: 'artL2321-1',
          chapter: 'Partie legislative, Livre III, Titre II',
          section: 'L2321-1',
          title: 'Article L. 2321-1',
          content: 'Dans le cadre de la strategie de securite nationale et de la politique de defense, le Premier ministre definit la politique et coordonne l\'action gouvernementale en matiere de securite et de defense des systemes d\'information. Il dispose a cette fin de l\'autorite nationale en matiere de securite des systemes d\'information qui est l\'Agence nationale de la securite des systemes d\'information (ANSSI).',
        },
        {
          provision_ref: 'artL2321-2',
          chapter: 'Partie legislative, Livre III, Titre II',
          section: 'L2321-2',
          title: 'Article L. 2321-2',
          content: 'Pour repondre a une attaque informatique qui vise les systemes d\'information affectant le potentiel de guerre ou economique, la securite ou la capacite de survie de la Nation, les services de l\'Etat peuvent, dans les conditions fixees par le Premier ministre, proceder aux operations techniques necessaires a la caracterisation de l\'attaque et a la neutralisation de ses effets en accedant aux systemes d\'information qui sont a l\'origine de l\'attaque.',
        },
        {
          provision_ref: 'artL2321-3',
          chapter: 'Partie legislative, Livre III, Titre II',
          section: 'L2321-3',
          title: 'Article L. 2321-3',
          content: 'Pour les besoins de la securite des systemes d\'information de l\'Etat et des operateurs mentionnes aux articles L. 1332-1 et L. 1332-2, l\'autorite nationale en matiere de securite des systemes d\'information peut obtenir des operateurs de communications electroniques, en application du III de l\'article L. 34-1 du code des postes et des communications electroniques, l\'identite, l\'adresse postale et l\'adresse electronique d\'utilisateurs ou de detenteurs de systemes d\'information vulnerables, menaces ou attaques.',
        },
        {
          provision_ref: 'artL1332-1',
          chapter: 'Partie legislative, Livre III, Titre III',
          section: 'L1332-1',
          title: 'Article L. 1332-1 - OIV',
          content: 'Les operateurs publics ou prives exploitant des etablissements ou utilisant des installations et ouvrages, dont l\'indisponibilite risquerait de diminuer d\'une facon importante le potentiel de guerre ou economique, la securite ou la capacite de survie de la nation, sont tenus de cooperer a leurs frais dans les conditions definies au present chapitre, a la protection desdits etablissements, installations et ouvrages contre toute menace, notamment a caractere terroriste.',
        },
        {
          provision_ref: 'artL1332-6-1',
          chapter: 'Partie legislative, Livre III, Titre III',
          section: 'L1332-6-1',
          title: 'Article L. 1332-6-1 - OIV security obligations',
          content: 'Le Premier ministre fixe les regles de securite necessaires a la protection des systemes d\'information des operateurs mentionnes aux articles L. 1332-1 et L. 1332-2 et des operateurs publics ou prives qui participent a ces systemes pour lesquels l\'atteinte a la securite ou au fonctionnement risquerait de diminuer d\'une facon importante le potentiel de guerre ou economique, la securite ou la capacite de survie de la Nation.',
        },
        {
          provision_ref: 'artL1332-6-2',
          chapter: 'Partie legislative, Livre III, Titre III',
          section: 'L1332-6-2',
          title: 'Article L. 1332-6-2 - Incident notification',
          content: 'Les operateurs mentionnes aux articles L. 1332-1 et L. 1332-2 informent sans delai le Premier ministre des incidents affectant le fonctionnement ou la securite des systemes d\'information mentionnes au premier alinea de l\'article L. 1332-6-1.',
        },
        {
          provision_ref: 'artL1332-6-3',
          chapter: 'Partie legislative, Livre III, Titre III',
          section: 'L1332-6-3',
          title: 'Article L. 1332-6-3 - Security audits',
          content: 'Le Premier ministre peut decider de soumettre les operateurs mentionnes aux articles L. 1332-1 et L. 1332-2 a des controles destines a verifier le niveau de securite et le respect des regles de securite prevues a l\'article L. 1332-6-1. Ces controles sont realises par l\'autorite nationale en matiere de securite des systemes d\'information ou par des prestataires de service qualifies par cette autorite.',
        },
        {
          provision_ref: 'artL1332-6-4',
          chapter: 'Partie legislative, Livre III, Titre III',
          section: 'L1332-6-4',
          title: 'Article L. 1332-6-4 - Crisis measures',
          content: 'En cas de crise majeure menacant ou affectant la securite des systemes d\'information, le Premier ministre peut decider des mesures que les operateurs mentionnes aux articles L. 1332-1 et L. 1332-2 doivent mettre en oeuvre.',
        },
      ],
    },
  },
  {
    id: 'code-postes-telecom-cyber',
    name: 'Postal and Electronic Communications Code - Cybersecurity provisions',
    nameFr: 'Code des postes et des communications electroniques - Dispositions relatives a la cybersecurite',
    pisteTextId: 'LEGITEXT000006070987',
    legifranceUrl: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070987/',
    manualSeed: {
      id: 'code-postes-telecom-cyber',
      type: 'statute',
      title: 'Code des postes et des communications electroniques - Dispositions relatives a la securite',
      title_en: 'Postal and Electronic Communications Code - Security provisions',
      short_name: 'CPCE (securite)',
      status: 'in_force',
      url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070987/',
      description: 'Security obligations for electronic communications operators, including data retention, integrity requirements, and cooperation with ANSSI.',
      provisions: [
        {
          provision_ref: 'artL33-1',
          chapter: 'Livre II, Titre Ier',
          section: 'L33-1',
          title: 'Article L. 33-1 - Telecommunications operator obligations',
          content: 'L\'etablissement et l\'exploitation des reseaux ouverts au public et la fourniture au public de services de communications electroniques sont libres sous reserve d\'une declaration prealable aupres de l\'Autorite de regulation des communications electroniques, des postes et de la distribution de la presse. Cette declaration ne peut etre refusee.',
        },
        {
          provision_ref: 'artL33-14',
          chapter: 'Livre II, Titre Ier',
          section: 'L33-14',
          title: 'Article L. 33-14 - DNS/threat blocking',
          content: 'Pour les besoins de la securite et de la defense des systemes d\'information, les operateurs de communications electroniques peuvent recourir, sur les reseaux de communications electroniques qu\'ils exploitent, a des dispositifs mettant en oeuvre des marqueurs techniques aux seules fins de detecter des evenements susceptibles d\'affecter la securite des systemes d\'information de leurs abonnes.',
        },
        {
          provision_ref: 'artL34-1',
          chapter: 'Livre II, Titre Ier',
          section: 'L34-1',
          title: 'Article L. 34-1 - Data retention',
          content: 'Les operateurs de communications electroniques, et notamment les personnes dont l\'activite est d\'offrir un acces a des services de communication au public en ligne, effacent ou rendent anonymes les donnees relatives au trafic. Les personnes qui fournissent au public des services de communications electroniques etablissent et tiennent a jour, dans le respect des dispositions de l\'alinea precedent, une documentation decrivant les systemes d\'information de traitement des donnees, les interconnexions existantes et les mesures de securite mises en oeuvre.',
        },
        {
          provision_ref: 'artL36-14',
          chapter: 'Livre II, Titre Ier',
          section: 'L36-14',
          title: 'Article L. 36-14 - ARCEP security oversight',
          content: 'L\'Autorite de regulation des communications electroniques, des postes et de la distribution de la presse est consultee sur les projets de loi ou de decret relatifs aux communications electroniques et participe a leur mise en oeuvre. Conformement a l\'article L. 2321-3 du code de la defense, elle transmet a l\'autorite nationale en matiere de securite des systemes d\'information les informations dont elle dispose sur les vulnerabilites affectant la securite des reseaux et services de communications electroniques.',
        },
      ],
    },
  },
  {
    id: 'loi-programmation-militaire-cyber',
    name: 'Military Programming Law 2024-2030 - Cyber provisions',
    nameFr: 'Loi n 2023-703 du 1er aout 2023 relative a la programmation militaire 2024-2030 (dispositions cyber)',
    legifranceUrl: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047914986',
    manualSeed: {
      id: 'loi-programmation-militaire-cyber',
      type: 'statute',
      title: 'Loi n 2023-703 du 1er aout 2023 relative a la programmation militaire pour les annees 2024 a 2030',
      title_en: 'Military Programming Law 2024-2030 (cyber provisions)',
      short_name: 'LPM 2024-2030 (cyber)',
      status: 'in_force',
      issued_date: '2023-08-01',
      in_force_date: '2023-08-02',
      url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047914986',
      description: 'The 2024-2030 Military Programming Law significantly expands ANSSI\'s powers for cyber threat detection and response, including DNS filtering, vulnerability disclosure, and expanded data collection for threat characterization.',
      provisions: [
        {
          provision_ref: 'art64',
          chapter: 'Chapitre V - Dispositions relatives a la lutte informatique',
          section: '64',
          title: 'Article 64 - ANSSI DNS threat blocking',
          content: 'Lorsqu\'il est constate qu\'une menace susceptible de porter atteinte a la securite nationale resulte de l\'exploitation d\'un nom de domaine, l\'autorite nationale en matiere de securite des systemes d\'information peut demander a toute personne concourant, directement ou par l\'intermediaire d\'autres personnes, a l\'adressage par noms de domaine sur internet de prendre les mesures les plus adaptees pour neutraliser cette menace.',
        },
        {
          provision_ref: 'art65',
          chapter: 'Chapitre V - Dispositions relatives a la lutte informatique',
          section: '65',
          title: 'Article 65 - Extended data collection for ANSSI',
          content: 'Pour les besoins de la securite des systemes d\'information, l\'autorite nationale en matiere de securite des systemes d\'information peut mettre en oeuvre, sur les reseaux d\'un operateur de communications electroniques ou sur le systeme d\'information d\'un fournisseur d\'acces a des services de communication au public en ligne ou d\'un hebergeur, des dispositifs mettant en oeuvre des marqueurs techniques aux seules fins de detecter des evenements susceptibles d\'affecter la securite des systemes d\'information.',
        },
        {
          provision_ref: 'art66',
          chapter: 'Chapitre V - Dispositions relatives a la lutte informatique',
          section: '66',
          title: 'Article 66 - Vulnerability disclosure coordination',
          content: 'L\'autorite nationale en matiere de securite des systemes d\'information peut imposer, pour une duree et dans une mesure strictement necessaires et proportionnees a la menace en cours ou imminente, aux operateurs de communications electroniques et aux fournisseurs de systemes de resolution de noms de domaine, la mise en oeuvre de mesures de filtrage de noms de domaine utilisees par un attaquant.',
        },
      ],
    },
  },
  {
    id: 'nis2-transposition-france',
    name: 'NIS 2 Transposition (anticipated framework)',
    nameFr: 'Transposition de la directive (UE) 2022/2555 (NIS 2) en droit francais',
    legifranceUrl: 'https://www.legifrance.gouv.fr/',
    manualSeed: {
      id: 'nis2-transposition-france',
      type: 'statute',
      title: 'Cadre de transposition de la directive NIS 2 en droit francais',
      title_en: 'Framework for NIS 2 Directive transposition into French law',
      short_name: 'NIS 2 FR transposition',
      status: 'not_yet_in_force',
      url: 'https://cyber.gouv.fr/la-directive-nis-2',
      description: 'France\'s transposition of NIS 2 Directive (EU 2022/2555). ANSSI leads the implementation. Expected to designate ANSSI as the national competent authority and CSIRT, extend cybersecurity obligations to "essential" and "important" entities (estimated 10,000+ entities in France), establish incident notification requirements (24h early warning, 72h full report), and mandate risk management measures. The transposition deadline was October 17, 2024.',
      provisions: [
        {
          provision_ref: 'art-scope',
          section: 'scope',
          title: 'Scope - Essential and Important Entities',
          content: 'La transposition NIS 2 distingue les "entites essentielles" (EE) et les "entites importantes" (EI). Les EE comprennent les secteurs de l\'energie, des transports, de la sante, de l\'eau, des infrastructures numeriques, de l\'administration publique et de l\'espace. Les EI comprennent les services postaux, la gestion des dechets, la fabrication, les services numeriques et la recherche. Le critere de taille s\'applique : moyennes entreprises (50+ salaries ou 10M+ CA) et grandes entreprises.',
        },
        {
          provision_ref: 'art-notification',
          section: 'notification',
          title: 'Notification d\'incidents',
          content: 'Les entites assujetties doivent notifier a l\'ANSSI, sans retard injustifie, tout incident ayant un impact significatif sur la fourniture de leurs services. Une alerte precoce doit etre transmise dans les 24 heures suivant la detection de l\'incident. Une notification complete doit etre soumise dans les 72 heures. Un rapport final est du dans un delai d\'un mois.',
        },
        {
          provision_ref: 'art-measures',
          section: 'measures',
          title: 'Mesures de gestion des risques',
          content: 'Les entites doivent mettre en oeuvre des mesures techniques, operationnelles et organisationnelles appropriees et proportionnees pour gerer les risques qui menacent la securite des reseaux et des systemes d\'information. Ces mesures comprennent au minimum : les politiques d\'analyse des risques et de securite des systemes d\'information ; la gestion des incidents ; la continuite des activites et gestion de crise ; la securite de la chaine d\'approvisionnement ; la securite de l\'acquisition, du developpement et de la maintenance des reseaux et des systemes d\'information ; les politiques et procedures pour evaluer l\'efficacite des mesures de gestion des risques ; les pratiques de base en matiere de cyber-hygiene et la formation a la cybersecurite ; les politiques et procedures relatives a l\'utilisation de la cryptographie ; la securite des ressources humaines, les politiques de controle d\'acces et la gestion des actifs.',
        },
        {
          provision_ref: 'art-sanctions',
          section: 'sanctions',
          title: 'Sanctions',
          content: 'Les entites essentielles s\'exposent a des amendes administratives pouvant atteindre 10 000 000 EUR ou 2% du chiffre d\'affaires annuel mondial total de l\'exercice precedent (le montant le plus eleve etant retenu). Les entites importantes s\'exposent a des amendes pouvant atteindre 7 000 000 EUR ou 1,4% du chiffre d\'affaires annuel mondial total.',
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Ingestion logic
// ---------------------------------------------------------------------------

interface IngestResult {
  codeId: string;
  source: 'piste' | 'legifrance' | 'manual';
  provisionCount: number;
}

async function ingestCode(config: CodeConfig): Promise<IngestResult> {
  console.log(`\n--- Ingesting: ${config.name} ---`);

  // Strategy 1: Try PISTE sandbox
  if (config.pisteTextId) {
    console.log(`  Trying PISTE sandbox (textId: ${config.pisteTextId})...`);
    const articles = await fetchFromPisteSandbox(config.pisteTextId);
    if (articles && articles.length > 0) {
      console.log(`  PISTE returned ${articles.length} articles`);
      const seed = apiArticlesToSeed(config, articles);
      writeSeed(seed);
      return { codeId: config.id, source: 'piste', provisionCount: seed.provisions.length };
    }
    console.log('  PISTE sandbox did not return articles');
  }

  // Strategy 2: Try Legifrance HTML scraping for configured article IDs
  if (config.articleIds && config.articleIds.length > 0) {
    console.log(`  Trying Legifrance HTML scraping for ${config.articleIds.length} articles...`);
    const articles: FetchedArticle[] = [];
    for (const artId of config.articleIds) {
      const article = await fetchArticleFromLegifrance(artId);
      if (article) articles.push(article);
    }
    if (articles.length > 0) {
      console.log(`  Scraped ${articles.length} articles from Legifrance`);
      const seed = apiArticlesToSeed(config, articles);
      writeSeed(seed);
      return { codeId: config.id, source: 'legifrance', provisionCount: seed.provisions.length };
    }
    console.log('  Legifrance scraping failed');
  }

  // Strategy 3: Use manual seed data (always succeeds)
  console.log('  Using manual seed data');
  writeSeed(config.manualSeed);
  return { codeId: config.id, source: 'manual', provisionCount: config.manualSeed.provisions.length };
}

function apiArticlesToSeed(config: CodeConfig, articles: FetchedArticle[]): SeedDocument {
  const provisions: SeedProvision[] = articles.map((art, index) => {
    const normalized = normalizeArticleNum(art.num);
    return {
      provision_ref: `art${normalized}`,
      section: normalized || String(index + 1),
      title: art.title || articleTitle(art.num),
      content: art.content,
    };
  });

  return {
    ...config.manualSeed,
    provisions,
  };
}

function writeSeed(seed: SeedDocument): void {
  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  const filePath = path.join(SEED_DIR, `${seed.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(seed, null, 2), 'utf-8');
  console.log(`  Wrote ${filePath} (${seed.provisions.length} provisions)`);
}

// ---------------------------------------------------------------------------
// EU references seed data
// ---------------------------------------------------------------------------

function writeEuReferences(): void {
  const euData = {
    eu_documents: [
      {
        id: 'regulation:2016/679',
        type: 'regulation',
        year: 2016,
        number: 679,
        community: 'EU',
        celex_number: '32016R0679',
        title: 'Regulation (EU) 2016/679 on the protection of natural persons with regard to the processing of personal data (GDPR)',
        short_name: 'GDPR',
        url_eur_lex: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
        in_force: true,
      },
      {
        id: 'directive:2022/2555',
        type: 'directive',
        year: 2022,
        number: 2555,
        community: 'EU',
        celex_number: '32022L2555',
        title: 'Directive (EU) 2022/2555 on measures for a high common level of cybersecurity across the Union (NIS 2)',
        short_name: 'NIS 2',
        url_eur_lex: 'https://eur-lex.europa.eu/eli/dir/2022/2555',
        in_force: true,
      },
      {
        id: 'directive:2016/1148',
        type: 'directive',
        year: 2016,
        number: 1148,
        community: 'EU',
        celex_number: '32016L1148',
        title: 'Directive (EU) 2016/1148 concerning measures for a high common level of security of network and information systems (NIS 1)',
        short_name: 'NIS 1',
        url_eur_lex: 'https://eur-lex.europa.eu/eli/dir/2016/1148',
        in_force: false,
      },
      {
        id: 'directive:2013/40',
        type: 'directive',
        year: 2013,
        number: 40,
        community: 'EU',
        celex_number: '32013L0040',
        title: 'Directive 2013/40/EU on attacks against information systems',
        short_name: 'Cybercrime Directive',
        url_eur_lex: 'https://eur-lex.europa.eu/eli/dir/2013/40',
        in_force: true,
      },
      {
        id: 'regulation:2019/881',
        type: 'regulation',
        year: 2019,
        number: 881,
        community: 'EU',
        celex_number: '32019R0881',
        title: 'Regulation (EU) 2019/881 on ENISA and on information and communications technology cybersecurity certification (Cybersecurity Act)',
        short_name: 'Cybersecurity Act',
        url_eur_lex: 'https://eur-lex.europa.eu/eli/reg/2019/881',
        in_force: true,
      },
    ],
    eu_references: [
      // Code penal -> Cybercrime Directive
      {
        source_type: 'document',
        source_id: 'code-penal-cyber',
        document_id: 'code-penal-cyber',
        eu_document_id: 'directive:2013/40',
        reference_type: 'implements',
        is_primary_implementation: true,
        implementation_status: 'complete',
        reference_context: 'Articles 323-1 to 323-7 implement the Cybercrime Directive requirements for criminalizing illegal access, system interference, and data interference.',
      },
      // Loi Informatique et Libertes -> GDPR
      {
        source_type: 'document',
        source_id: 'loi-informatique-libertes',
        document_id: 'loi-informatique-libertes',
        eu_document_id: 'regulation:2016/679',
        reference_type: 'supplements',
        is_primary_implementation: true,
        implementation_status: 'complete',
        reference_context: 'The Loi Informatique et Libertes was extensively amended in 2018 to supplement the GDPR, exercising national options for processing of special categories of data, minor consent age, and CNIL powers.',
      },
      // Code de la defense -> NIS 1
      {
        source_type: 'document',
        source_id: 'code-defense-cyber',
        document_id: 'code-defense-cyber',
        eu_document_id: 'directive:2016/1148',
        reference_type: 'implements',
        is_primary_implementation: true,
        implementation_status: 'complete',
        reference_context: 'The OIV framework (Articles L. 1332-1 et seq.) predates and exceeds NIS 1 requirements. France was ahead of EU requirements through its 2013 LPM cyber provisions.',
      },
      // NIS 2 transposition
      {
        source_type: 'document',
        source_id: 'nis2-transposition-france',
        document_id: 'nis2-transposition-france',
        eu_document_id: 'directive:2022/2555',
        reference_type: 'implements',
        is_primary_implementation: true,
        implementation_status: 'pending',
        reference_context: 'France transposition of NIS 2 in progress. ANSSI designated as lead authority. Extends obligations to approximately 10,000+ entities.',
      },
    ],
  };

  const filePath = path.join(SEED_DIR, 'eu-references.json');
  fs.writeFileSync(filePath, JSON.stringify(euData, null, 2), 'utf-8');
  console.log(`\nWrote EU references: ${filePath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { limit, code, seedOnly } = parseArgs();

  console.log('=== French Law MCP — Ingestion Pipeline ===\n');
  console.log(`Seed directory: ${SEED_DIR}`);

  if (!fs.existsSync(SEED_DIR)) {
    fs.mkdirSync(SEED_DIR, { recursive: true });
  }

  // Filter codes
  let codes = CODE_CONFIGS;
  if (code) {
    codes = codes.filter(c => c.id === code);
    if (codes.length === 0) {
      console.error(`Unknown code: ${code}`);
      console.error(`Available codes: ${CODE_CONFIGS.map(c => c.id).join(', ')}`);
      process.exit(1);
    }
  }
  if (limit) {
    codes = codes.slice(0, limit);
  }

  console.log(`Codes to ingest: ${codes.map(c => c.id).join(', ')}`);

  const results: IngestResult[] = [];

  for (const config of codes) {
    if (seedOnly) {
      // Skip remote fetching, use manual seeds directly
      console.log(`\n--- Writing manual seed: ${config.name} ---`);
      writeSeed(config.manualSeed);
      results.push({
        codeId: config.id,
        source: 'manual',
        provisionCount: config.manualSeed.provisions.length,
      });
    } else {
      const result = await ingestCode(config);
      results.push(result);
    }
  }

  // Write EU references
  writeEuReferences();

  // Summary
  console.log('\n=== Ingestion Summary ===');
  let totalProvisions = 0;
  for (const result of results) {
    console.log(`  ${result.codeId}: ${result.provisionCount} provisions (source: ${result.source})`);
    totalProvisions += result.provisionCount;
  }
  console.log(`\nTotal: ${results.length} codes, ${totalProvisions} provisions`);
  console.log(`\nNext step: npm run build:db`);
}

main().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
