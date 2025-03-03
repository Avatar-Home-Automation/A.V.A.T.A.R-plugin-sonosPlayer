"use strict";

// Dépendances natives
const { resolve, join } = require("node:path");
const { platform } = require("node:os");
const { exec, spawn } = require("node:child_process");
const { existsSync, readJsonSync, chmodSync } = require("fs-extra");

// Dépendances locales
const parseVoicesEspeak = require("./parseVoicesEspeak").default;
const parseVoicesSAPI = require("./parseVoicesSAPI").default;
const parseVoicesDarwin = require("./parseVoicesDarwin").default;
const readOptionsToEspeakArgs = require("./readOptionsToEspeakArgs").default;
const readOptionsToSAPIArgs = require("./readOptionsToSAPIArgs").default;
const readOptionsToDarwinArgs = require("./readOptionsToDarwinArgs").default;

// Constantes
const CURRENT_PLATFORM = platform().trim().toLowerCase();
const CSCRIPT_ARGS = ["//NoLogo", "//B"];

// Dossiers spéciaux pour Mbrola sur Linux (si nécessaire)
const Jsonvoices = resolve(__dirname, "../../batchs", CURRENT_PLATFORM, "voices/voices.json");
const BCP47languages = resolve(__dirname, "../../batchs/win32", "BCP47.loc");


/**
 * Classe principale pour la lecture de texte par synthèse vocale
 */
class SimpleTTS {
  /**
   * @param {string} scriptsFolderPath - Chemin vers le dossier contenant les scripts (par défaut ../../batchs).
   */
  constructor(scriptsFolderPath = join(__dirname, "..", "..", "batchs")) {
    this._forceStop = false;      // Flag pour arrêter la lecture
    this._readPromise = null;     // Promesse en cours pour la lecture
    this._reader = null;          // Processus de lecture
    this._scriptsDirectory = scriptsFolderPath;
    this.defaultVoice = null;     // Voix par défaut (sera déterminée dynamiquement)
    this.forceEspeak = false;     // (Non utilisé ici, conservé si besoin)
  }

  /**
   * Renvoie le moteur TTS détecté en fonction de la plateforme
   * @returns {string} "sapi" (Windows), "espeak" (Linux) ou "say" (macOS)
   */
  getTTSSystem() {
    switch (CURRENT_PLATFORM) {
      case "win32":
        return "sapi";
      case "linux":
        return "espeak";
      case "darwin":
        return "say";
      default:
        return "unknown";
    }
  }

  /**
   * Récupère la liste des voix disponibles
   * @returns {Promise<Array>} - Liste des voix
   */
  getVoices() {
    return new Promise((resolve, reject) => {
      let command;

      if (CURRENT_PLATFORM === "win32") {
        // Windows (SAPI)
        command = `cscript ${CSCRIPT_ARGS.join(" ")} "${join(this._scriptsDirectory, "listvoices.vbs")}"`;
      } else if (CURRENT_PLATFORM === "linux") {
        // Linux (espeak)
        command = "espeak --voices";
      } else if (CURRENT_PLATFORM === "darwin") {
        // macOS (say)
        command = "say -v '?'";
      } else {
        // Plateforme non supportée
        return reject(new Error(`Unsupported platform: ${CURRENT_PLATFORM}`));
      }

      exec(command, (err, stdout, stderr) => {
        if (err) {
          return reject(stderr ? new Error(stderr) : err);
        }

        const lines = stdout
          .trim()
          .replace(/\r/g, "\n")
          .replace(/\n\n/g, "\n")
          .split("\n");

        // Windows
        if (CURRENT_PLATFORM === "win32") {
          const voices = parseVoicesSAPI(lines).map((voice) => ({
            gender: voice.Gender.trim().toLowerCase(),
            name: voice.Name.trim().toLowerCase(),
            language: voice.Language.trim().toLowerCase()
          }));
          return resolve(voices);
        }

        // Linux
        if (CURRENT_PLATFORM === "linux") {
          const allVoices = [];
          // Ajout des voix spéciales (Mbrola, etc.) si disponible
          if (existsSync(Jsonvoices)) {
            const specialVoices = readJsonSync(Jsonvoices, { throws: true });
            specialVoices.forEach((voice) => {
              allVoices.push({
                gender: voice.gender,
                name: voice.name,
                language: voice.language
              });
            });
          }
          // Ajout des voix espeak
          const espeakVoices = parseVoicesEspeak(lines).map((voice) => ({
            gender: voice["Age/Gender"] === "F" ? "female" : "male",
            name: voice.VoiceName.trim().toLowerCase(),
            language: voice.Language.trim().toLowerCase()
          }));
          allVoices.push(...espeakVoices);
          return resolve(allVoices);
        }

        // macOS
        if (CURRENT_PLATFORM === "darwin") {
          const voices = parseVoicesDarwin(lines).map((voice) => ({
            name: voice.VoiceName,
            language: voice.Language
          }));
          return resolve(voices);
        }
      });
    });
  }

  /**
   * Indique si on est actuellement en train de lire un texte
   * @returns {boolean}
   */
  isReading() {
    return this._reader !== null;
  }

  /**
   * Lit le texte passé en paramètre (ou dans l'objet d'options)
   * @param {object|string} _options - texte ou objet d’options { text, voice, speed, ... }
   * @returns {Promise<boolean>} - Résolue quand la lecture est terminée ou rejetée si erreur
   */
  read(_options) {
    // Vérifier si l’utilisateur a fourni des options valides
    if (typeof _options === "undefined") {
      return Promise.reject(new ReferenceError("Missing options parameter"));
    }
    if (typeof _options !== "object" && typeof _options !== "string") {
      return Promise.reject(new TypeError("options parameter must be an object or a string"));
    }

    // Convertir en objet si c'est un texte pur
    const options = typeof _options === "string" ? { text: _options } : _options;

    // Vérifier la présence du texte
    if (typeof options.text === "undefined") {
      return Promise.reject(new ReferenceError("Missing text parameter"));
    }
    if (typeof options.text !== "string") {
      return Promise.reject(new TypeError("text parameter must be a string"));
    }
    if (options.text.trim() === "") {
      return Promise.reject(new Error("text parameter is empty"));
    }

    // Vérifier si on est déjà en train de lire
    if (this.isReading()) {
      return Promise.reject(new Error("Already reading a text"));
    }

    this._forceStop = false;
    const TTS_SYSTEM = this.getTTSSystem();

    // On enchaîne les promesses pour configurer et lancer la lecture
    this._readPromise = Promise.resolve()
      // Étape 1 : déterminer la voix par défaut si besoin
      .then(() => {
        if (options.voice && options.voice === 'by default') options.voice = null;
        if (!options.voice) {
          return this.getVoices().then((voices) => {
            if (CURRENT_PLATFORM === 'win32') {
              const BCP47json = readJsonSync(BCP47languages, { throws: true });
              const BCP47 = Object.values(BCP47json).find(entry => entry.tag === Config.modules.sonosPlayer.ttsLanguage);
              if (BCP47) {
                this.defaultVoice = voices.find(voice => voice.language.toLowerCase() === BCP47.code.toLowerCase());
              }
            } else if (CURRENT_PLATFORM === 'darwin') {
              this.defaultVoice = voices.find(voice => voice.language.replace(/_/g, '-') === Config.modules.sonosPlayer.ttsLanguage);
            } else if (CURRENT_PLATFORM === 'linux') {
              
              const hasJsonvoices = existsSync(Jsonvoices);
              // Gérer le cas Mbrola depuis le fichier JSON
              if (hasJsonvoices) {
                const specialVoices = readJsonSync(Jsonvoices, { throws: true });
                const defaultVoice = specialVoices.find(voice => voice.default === true); 
                if (defaultVoice) {
                  this.defaultVoice = defaultVoice.name;
                } 
              }
              // Gérer le cas 'en-EN' dans les voix espeak
              if (!this.defaultVoice) {
                this.defaultVoice = voices.find(voice => voice.language.toLowerCase() === Config.modules.sonosPlayer.ttsLanguage.toLowerCase());
              }
              // Gérer le cas 'en' dans les voix espeak
              if (!this.defaultVoice) {
                this.defaultVoice = voices.find(voice => voice.language.toLowerCase().split('-')[0] === Config.modules.sonosPlayer.ttsLanguage.toLowerCase().split('-')[0]);
              }
            }
          });
        }  
      })
      // Étape 2 : prétraitement de la voix (notamment pour Linux / Mbrola)
      .then(() => {
        // Si aucune voix spécifiée ou mal définie, on assigne la voix par défaut
        if (!options.voice && this.defaultVoice) {
          options.voice = this.defaultVoice;
        } 

        // Gérer le cas Mbrola depuis le fichier JSON, recherche du fichier mbrola et le code
        if (process.platform === 'linux' && options.voice) {
          const hasJsonvoices = existsSync(Jsonvoices);
          // Gérer le cas Mbrola depuis le fichier JSON
          if (hasJsonvoices && !options.mbrolaFile) {
            const specialVoices = readJsonSync(Jsonvoices, { throws: true });
            for (const voice of specialVoices) {
              // On cherche d’abord une voix par défaut dans voices.json
              if (voice.name === options.voice) {
                options.voice = voice.code;
                options.mbrolaFile = voice.file;
              }
            }
          }
        }

        if (!options.voice){
          throw new Error(`No default voice found, please specify a voice in the properties`);
        }
       
        // Limiter la vitesse entre 0 et 100
        if (typeof options.speed === "undefined") {
          options.speed = 50;
        }
        options.speed = Math.max(0, Math.min(100, Math.round(options.speed)));
      })
      // Étape 3 : construction des arguments de la ligne de commande
      .then(() => {
        if (this._forceStop) {
          return options; // si stop demandé, on arrête tôt
        }

        let args;
        switch (CURRENT_PLATFORM) {
          case "win32":
            args = readOptionsToSAPIArgs(options);
            break;
          case "linux":
            args = readOptionsToEspeakArgs(options);
            // Ajout de mbrola si spécifié
            if (options.mbrolaFile) {
              args.push("mbrola", options.mbrolaFile);
            } else {
              args.push(TTS_SYSTEM);
            }
            break;
          case "darwin":
            args = readOptionsToDarwinArgs(options);
            break;
          default:
            throw new Error(`Unsupported platform: ${CURRENT_PLATFORM}`);
        }

        args.push(options.text);
        return args;
      })
      // Étape 4 : lancement effectif de la lecture
      .then((args) => {
        return new Promise((resolve, reject) => {
          if (this._forceStop) {
            // Si arrêt demandé entre-temps
            return resolve();
          }

          let script;
          if (CURRENT_PLATFORM === "win32") {
            // Sur Windows, on lance cscript playtext.vbs avec les bons arguments
            script = "cscript";
            args = CSCRIPT_ARGS.concat([join(this._scriptsDirectory, "playtext.vbs")]).concat(args);
          } else {
            // Sur Linux ou Mac, on lance playtext.sh
            script = join(this._scriptsDirectory, "playtext.sh");
            chmodSync(script, "755");
          }

          // Démarrer le processus de lecture
          this._reader = spawn(script, args);
          let errorOutput = "";

          if (this._reader.stderr) {
            this._reader.stderr.on("data", (data) => {
              errorOutput += typeof data === "string" ? data : data.toString("ascii");
            });
          }

          this._reader.on("close", (code) => {
            this._reader = null;
            return code
              ? reject(new Error(errorOutput || "Error during TTS process"))
              : resolve(true);
          });
        });
      })
      // En cas de réussite, on réinitialise l’état
      .then(() => {
        this._forceStop = false;
        return true;
      })
      // En cas d’erreur, on réinitialise également
      .catch((err) => {
        this._forceStop = false;
        this._reader = null;
        return Promise.reject(err);
      });

    return this._readPromise;
  }

  /**
   * Stoppe la lecture en cours s’il y en a une
   * @returns {Promise<void>} - Résolue quand la lecture est bien stoppée
   */
  stopReading() {
    // Si on a un process en cours, on le tue
    if (this._reader) {
      try {
        this._reader.kill();
        this._reader = null;
      } catch (e) {
        return Promise.reject(e);
      }
    } else {
      // Si aucun process actif, on force l’arrêt de la promesse
      this._forceStop = true;
    }

    // On attend la fin de la promesse en cours s’il y en a une
    if (this._readPromise) {
      return this._readPromise.then(() => Promise.resolve());
    }
    return Promise.resolve();
  }
}

module.exports = SimpleTTS;


