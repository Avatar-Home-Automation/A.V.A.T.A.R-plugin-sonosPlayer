import * as path from 'node:path';
import { manager } from '../../sonosPlayer.js';
import fs from 'fs-extra';
import { parseFile } from 'music-metadata';
import _ from 'underscore';

import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

import { default as SimpleTTS } from '../simpletts/lib/cjs/main.cjs';
const vbsFolder = path.resolve(__dirname, "..", "simpletts", "batchs", process.platform);
const TTS = new SimpleTTS(vbsFolder);

let musicMappingWindow;


export async function musicMapping(music, callback) {

    if (musicMappingWindow) return musicMappingWindow.show();

    let Locale = await Avatar.lang.getPak("sonosPlayer", Config.language);   
    if (!Locale) {
        error (`sonosPlayer: Unable to find the '${Config.language}' language pak.`);
        Locale = await Avatar.lang.getPak("sonosPlayer", 'en');   
    }	
    
    let style = {
        parent: Avatar.Interface.mainWindow(),
        frame: false,
        movable: true,
        resizable: true,
        minimizable: false,
        alwaysOnTop: false,
        show: false,
        width: 400,
        minWidth: 300,
        height: 310,
        minHeight: 185,
        icon: path.resolve(__dirname, '..', '..', 'assets', 'images', 'sonosPlayer.png'),
        webPreferences: {
            preload: path.resolve(__dirname, '..', 'mapping', 'mapping-preload.js')
        },
        title: "Music mapping"
    }

    if (fs.existsSync(path.resolve(__dirname, '..', '..', 'assets', 'style.json'))) {
        const prop = fs.readJsonSync(path.resolve(__dirname, '..', 'mapping', 'style.json'), { throws: false });
        if (prop) {
            style.x = prop.x;
            style.y = prop.y;
        }
    }

    musicMappingWindow = await Avatar.Interface.BrowserWindow(style, path.resolve(__dirname, '..', 'mapping', 'mapping.html'), false);

    musicMappingWindow.once('ready-to-show', () => {
        musicMappingWindow.show();
        musicMappingWindow.webContents.send('onInit-musicMapping', music, Config.modules.sonosPlayer.mappingRules);
        if (Config.modules.sonosPlayer.devTools) musicMappingWindow.webContents.openDevTools();
    })

    Avatar.Interface.ipcMain().on('quit-mapping', () => {
        musicMappingWindow.destroy();
    })

    Avatar.Interface.ipcMain().handle('apply-mapping', async (_event, mapping) => {
        return await applyMapping (mapping, callback);
    })

    // returns the localized message defined in arg
    Avatar.Interface.ipcMain().handle('mapping-msg', async (_event, arg) => {return Locale.get(arg)});

    musicMappingWindow.on('closed', () => {
        Avatar.Interface.ipcMain().removeHandler('mapping-msg');
        Avatar.Interface.ipcMain().removeHandler('apply-mapping');
        Avatar.Interface.ipcMain().removeAllListeners('quit-mapping');
        musicMappingWindow = null;
    })  

}


export async function addMapping (mapping) {

    try {
        if (mapping.exist) {
            Config.modules.sonosPlayer.mappingRules[mapping.list].push(mapping.sentence);
        } else {
            Config.modules.sonosPlayer.mappingRules[mapping.list] = [mapping.sentence];
        }

        fs.writeJsonSync(path.resolve(__dirname, "..", "..", "sonosPlayer.prop"), 
            {
                "modules":{
                    "sonosPlayer": Config.modules.sonosPlayer
                }
            }
        );
        return true;
    } catch (err) {
        error ("sonosPlayer:", err || err.stack);
        return false;
    }

}


async function applyMapping (mapping, callback) {

    if (!callback) {
        return await addMapping(mapping);
    } else {
        callback(mapping);
        return true;
    }
}


/**
 * Executes a common step for a given player device.
 *
 * @param {Function} action - The step function to execute if the player is found.
 * @param {Object} data - The data object containing client information.
 * @param {string} data.toClient - The identifier for the target client device.
 * @param {string} data.client - The identifier for the client.
 * @param {string} cmd - The command associated with the step.
 * @returns {Promise<void>} - A promise that resolves when the step is completed.
 */
export async function doAction (action, data, msg) {
    const player = manager.findDevice(data.toClient); 
    if (player) {
        try {
            await action(data, player);
        } catch (err) {
            Avatar.speak(data.Locale.get("error.music"), data.client, () => {
                if (Avatar.isMobile(data.client))
                    Avatar.Socket.getClientSocket(data.client).emit('askme_done');
            });
            error(`${msg}`, err || err.stack);
        }
    } else {
        if (Avatar.isMobile(data.client)) {
            Avatar.Socket.getClientSocket(data.client).emit('askme_done');
        } else {
            Avatar.Speech.end(data.client, true);
        }
        error(data.Locale.get(["error.noPlayer", `${msg}`, data.client]));
    }
}


/**
 * Resets the listening state for the given data.
 *
 * This function checks if the `client` and `toClient` properties of the `data` object are equal.
 * If they are equal, it resets the preset for the `client`. If they are not equal, it resets the preset for the `toClient`.
 * Finally, it ends the speech for the `client`.
 *
 * @param {Object} data - The data object containing client information.
 * @param {string} data.client - The client identifier.
 * @param {string} data.toClient - The target client identifier.
 */
export function resetListen(data) {
    if (data.client === data.toClient) {
        manager.resetPreset(data.client);
    }
    if (data.client !== data.toClient) {
        manager.resetPreset(data.toClient);
    }
    Avatar.Speech.end(data.client, true);
}


export async function getTTSSystem () {
    return await TTS.getVoices();
}


export async function ttsToWav (client, tts, callback, args) {

    // Decode URI
    tts = decodeURIComponent(tts);
  
    var accent = [
      /"/g, /\|/g,
      /\//g, /\\/g,
      /\>/g, /\</g,
      /\(/g, /\)/g,
      /\#/g, /\@/g,
      /\{/g, /\}/g,
      /\`/g
    ];
    for(var i = 0; i < accent.length; i++){
        tts = tts.replace(accent[i], '');
    }

    const avatarAudio = Config.modules.sonosPlayer.platform[process.platform].sharedFolder;
    const folder = path.resolve(avatarAudio, 'tts', 'speech', client);
    fs.ensureDirSync(folder);

    let file;
    if (process.platform === 'win32' || process.platform === 'linux') {
        file = path.resolve(folder, "speech.wav");
    } else if (process.platform === 'darwin') {
        file = path.resolve(folder, "speech.mp3");
        if (process.platform === 'darwin') {
            fs.removeSync(path.resolve(folder, "speech.aiff"));
        }   
    } 	
    fs.removeSync(file);

    let options = {text: tts, file: file};

    if (args.voice) {
        options.voice = args.voice
    } else if (Config.modules.sonosPlayer.platform[process.platform].voice.current.toLowerCase() !== "by default") {
        options.voice = Config.modules.sonosPlayer.platform[process.platform].voice.current;
    }

    if (args.speed) {
        options.speed = args.speed;
    } else if (Config.modules.sonosPlayer.platform[process.platform].voice.speed) {
        options.speed = Config.modules.sonosPlayer.platform[process.platform].voice.speed.toString();
    }
    
    TTS.read(options)
    .then(() => {
        return (fs.existsSync(file)) ? callback(true): callback();
    })
    .catch((err) => {
      callback({err: err || err.stack});
    });
  
}



/**
 * Calculates the duration of a WAV file.
 *
 * @param {string} filename - The name of the WAV file.
 * @param {string|number} [playFileWithFolder] - Optional folder path or duration number.
 * @returns {Promise<number>} The duration of the WAV file in seconds.
 *
 * @throws Will throw an error if the duration cannot be determined.
 */
export async function speakDuration (filename, playFileWithFolder) {

    if (playFileWithFolder && _.isNumber(playFileWithFolder)) {
        return playFileWithFolder;
    }

    const getWavDuration = (filename) => {
        return new Promise(async (resolve, reject) => {
            try {
                const metadata = await parseFile(filename);
                resolve(metadata.format.duration)
            } catch (err) {
                reject(err);
            }
        });
    }

    let file;
    if (process.platform === 'win32' || process.platform === 'linux') {
        file = 'speech.wav';
    } else if (process.platform === 'darwin') {
        file = 'speech.mp3';
    } 	

    if (!filename.endsWith(file)) {
        filename = playFileWithFolder ? playFileWithFolder : filename;
        try {
            const duration = await getWavDuration(filename);
            return duration;
        } catch (err) {
            error(Locale.get(["error.duration", err || err.stack]));
        }
    } else {

        const avatarAudio = Config.modules.sonosPlayer.platform[process.platform].sharedFolder;
        filename = filename.replace('//'+Config.modules.sonosPlayer.platform[process.platform].partage, avatarAudio);
        
        try {
            const duration = await getWavDuration(filename);
            return duration;
        } catch (err) {
            error(Locale.get(["error.duration", err || err.stack]));
        }

    }
}



export async function reformatString (tts) {

	for (var i = 0; i < tts.length; i++) {
      let num = parseInt(await fixedCharCodeAt(tts, i));
	  if (num === false) return false;
      if (num > 128 || isNaN(num)) {
		       tts = tts.replace(tts[i], '_');
      }
	}
  tts = await reformatStringNext (tts);
  tts = tts.replace(/_/g, '');
  return tts;
}


async function fixedCharCodeAt (str, idx) {
    idx = idx || 0;
    var code = str.charCodeAt(idx);
    var hi, low;

    if (0xD800 <= code && code <= 0xDBFF) {
        hi = code;
        low = str.charCodeAt(idx+1);
        if (isNaN(low)) {
			return false;
        }
        return ((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
    }
    if (0xDC00 <= code && code <= 0xDFFF) {
        return false;
    }
    return code;
}


async function reformatStringNext (str) {

    var accent = [
        / /g, /'/g,
        /"/g, /\?/g,
        /:/g, /\|/g,
        /\//g, /\\/g,
        /\>/g, /\</g,
        /!/g, /\./g,
        /\(/g, /\)/g,
        /\{/g, /\}/g,
        /\[/g, /\]/g,
        /\#/g, /\@/g,
        /\-/g, /\&/g,
        /\;/g, /\,/g,
        /\^/g, /\$/g,
        /\~/g, /\=/g,
        /\*/g, /\`/g
    ];
    for(var i = 0; i < accent.length; i++){
        str = str.replace(accent[i], '_');
    }
  
    return str;
  }