import * as path from 'node:path';
import * as url from 'url';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
import _ from 'underscore';
import fs from 'fs-extra';

import { DeviceDiscovery } from './lib/sonos/sonos.js';
import * as music from './lib/services/music.js'
import * as sound from './lib/services/sound.js'
import { reformatString, ttsToWav, speakDuration, getTTSSystem, musicMapping} from './lib/services/helper.js'


/** @private **/
let Locale;   

/**
 * Manages a collection of devices, providing methods to add, find, and retrieve device information.
 * Implements a singleton pattern to ensure only one instance of DeviceManager exists.
 */
class DeviceManager {
    constructor() {
        if (!DeviceManager.instance) {
            this.devices = new Map();
            DeviceManager.instance = this;
        }
        return DeviceManager.instance;
    }

	/**
	 * Adds a new device to the devices map.
	 *
	 * @param {Object} info - Information about the device.
	 * @param {string} info.roomName - The name of the room where the device is located.
	 * @param {string} info.displayName - The display name of the device.
	 * @param {string} info.UDN - The Unique Device Name (UDN) of the device.
	 * @param {Object} device - The device object containing host and port information.
	 * @param {string} device.host - The host address of the device.
	 * @param {number} device.port - The port number of the device.
	 */
    addDevice(info, device) {
        this.devices.set(info.roomName.toLowerCase(), {
            id: info.roomName,
            type: info.displayName,
            UDN: info.UDN,
            host: device.host,
            port: device.port,
            device: device,
			preset: {
				"preseted": false,
				"state": null,
				"mediaInfo": null,
				"volume": null,
				"muted": false
			}
        });
    }

	/**
	 * Finds and returns a device by its ID.
	 *
	 * @param {string} id - The unique identifier of the device.
	 * @returns {Object|undefined} The device object if found, otherwise undefined.
	 */
    findDevice(id) {
        return this.devices.get(id.toLowerCase());
    }

	/**
	 * Checks if the device with the given ID is preset.
	 *
	 * @param {string} id - The ID of the device to check.
	 * @returns {boolean} - Returns true if the device is preset, otherwise false.
	 */
	isPreseted(id) {
		if (!id) return false;
        const device = this.findDevice(id.toLowerCase());
        if (!device) return false;
		return device.preset.preseted;
    }

	/**
	 * Updates the preset of a device with the given ID.
	 *
	 * @param {string} id - The ID of the device to update.
	 * @param {Object} newPreset - The new preset values to assign to the device.
	 * @returns {boolean} - Returns true if the device was found and updated, otherwise false.
	 */
	updatePreset(id, newPreset) {
        const device = this.findDevice(id.toLowerCase());
        if (!device) return false;
        Object.assign(device.preset, newPreset);
        return true;
    }

	/**
	 * Resets the preset settings for a given device.
	 *
	 * @param {string} id - The identifier of the device to reset the preset for.
	 * @returns {boolean} - Returns true if the device was found and the preset was reset, otherwise false.
	 */
	resetPreset(id) {
        const device = this.findDevice(id.toLowerCase());
        if (!device) return false;
        device.preset = {
			preseted: false,
            state: null,
            mediaInfo: null,
            volume: null,
            muted: false
        };
        return true;
    }

	/**
	 * Retrieves the device player associated with the given ID.
	 *
	 * @param {string} id - The ID of the device player to retrieve.
	 * @returns {Object|null} The device player object if found, otherwise null.
	 */
	getDevicePlayer(id) {
        return this.devices.get(id.toLowerCase())?.device || null;
    }

	/**
	 * Retrieves the preset configuration for a given device ID.
	 *
	 * @param {string} id - The ID of the device to retrieve the preset for.
	 * @returns {Object|null} The preset configuration object if found, otherwise null.
	 */
	getPreset(id) {
		return this.devices.get(id.toLowerCase())?.preset || null;
	}

	/**
	 * Retrieves the type of a device based on its ID.
	 *
	 * @param {string} id - The unique identifier of the device.
	 * @returns {string|null} The type of the device if found, otherwise null.
	 */
	getDeviceType(id) {
        return this.devices.get(id.toLowerCase())?.type || null;
    }

	/**
	 * Retrieves all device IDs.
	 *
	 * @returns {Array<string>} An array containing all device IDs.
	 */
	getAllDeviceKeys() {
        return Array.from(this.devices.keys());
    }

	/**
	 * Retrieves all Sonos devices.
	 *
	 * @returns {Array} An array containing all Sonos devices.
	 */
	getAllDevices() {
        return Array.from(this.devices.values());
    }

	getKeyByDeviceId(deviceId) {
        for (const [key, device] of this.devices.entries()) {
            if (device.id.toLowerCase() === deviceId.toLowerCase()) {
                return key; 
            }
        }
        return null; 
    }

	/**
	 * Removes a device from the devices collection.
	 *
	 * @param {string} id - The ID of the device to remove.
	 * @returns {boolean} - Returns true if the device was successfully removed, otherwise false.
	 */
	removeDevice(id) {
        return this.devices.delete(id.toLowerCase());
    }

	/**
	 * Retrieves a list of all unique device IDs.
	 *
	 * @returns {string[]} An array of unique device IDs.
	 */
	getAllDeviceIds() {
        return Array.from(new Set(Array.from(this.devices.values()).map(device => device.id)));
    }
}


/**
 * Unmutes the specified client if certain conditions are met.
 * 
 * @param {string} client - The client to unmute.
 * @returns {Promise<void>} - A promise that resolves when the unmute operation is complete.
 * 
 * @remarks
 * This function checks if the client is mobile and not the server speaking. If the client is preset, it calls the `transportClosure` function to unmute the client.
 */
export async function unmuteClosure (client) {
	if (Avatar.isMobile(client) && !Avatar.Socket.isServerSpeak(client)) {
		return;
	}
	
	const playerPreseted = manager.isPreseted(client);
	if (playerPreseted) {
		await transportClosure (client);
	}
}


/**
 * Initializes the Sonos Player plugin.
 * 
 * This function performs the following steps:
 * 1. Checks if the `Config.client` is not defined.
 * 2. Adds the language pack for the Sonos Player plugin.
 * 3. Retrieves the language pack based on the configured language, defaults to English if not found.
 * 4. Checks if the TTS (Text-to-Speech) language is configured.
 * 5. Checks if the shared folder and partage settings are configured for the current platform.
 * 6. Performs Sonos discovery.
 * 7. Optionally logs the system voices if the `showSystemVoices` configuration is enabled.
 * 
 * @returns {Promise<void>} A promise that resolves when the initialization is complete.
 */
export async function init() {

	if (!Config?.client) {

		if (!await Avatar.lang.addPluginPak("sonosPlayer")) return;

		Locale = await Avatar.lang.getPak("sonosPlayer", Config.language);
		if (!Locale) {
			error(`Init sonosPlayer: Unable to find the '${Config.language}' language pak. Set English language by default.`);
			Locale = await Avatar.lang.getPak("sonosPlayer", 'en');
		}

		if (!Config.modules.sonosPlayer?.ttsLanguage) {
			error(Locale.get("error.noTTSLanguage"));
			return;		
		}

		if (!Config.modules.sonosPlayer.platform[process.platform].sharedFolder || !Config.modules.sonosPlayer.platform[process.platform].partage) {
			error(Locale.get("error.noPartage"));			
			return;
		}

		await sonosDiscovery();

		if (Config.modules.sonosPlayer.showSystemVoices) {
			const TTSSystem = await getTTSSystem();
			if (TTSSystem) {
				info("System voices:", TTSSystem);
			}
		}	
	}

}


/**
 * Handles various actions for the Sonos Player plugin.
 *
 * @param {Object} data - The data object containing action details and other parameters.
 * @param {Function} callback - The callback function to be executed after the action is performed.
 * @property {string} data.language - The language code for localization.
 * @property {Object} data.action - The action object containing the command to be executed.
 * @property {string} data.action.command - The command to be executed.
 * @property {string} [data.client] - The client identifier.
 * @property {string} [data.toClient] - The target client identifier.
 */
export async function action(data, callback) {

	try {

		data.Locale = Locale = await Avatar.lang.getPak("sonosPlayer", data.language);   
		if (!Locale) {
			error (`sonosPlayer: Unable to find the '${data.language}' language pak. Set English language by default.`);
			// English by default
			data.Locale =Locale = await Avatar.lang.getPak("sonosPlayer", 'en');
		}	

		if (!Config.modules.sonosPlayer.search[data.language]) {
			throw new Error(Locale.get("error.noLocalLanguage"));		
		}

		// Table of actions
		const tblCommand = {
			test: () => test(data.client, data),
			activateTvSound: () => sound.activateTvSound (data),
			muteOn : () => sound.muteOnOff (data, false),
      		muteOff : () => sound.muteOnOff (data, true),
			volumeUp : () => sound.volume (data, Config.modules.sonosPlayer?.volumeUpDown || 5, true),
			volumeDown: () => sound.volume (data, Config.modules.sonosPlayer?.volumeUpDown || 5, false),
			setVolume: () => sound.volume (data),
			musicSearch: () => music.search (data, "music"),
			radioSearch: () => music.search (data, "radio"),
			musicPlay: () => music.play (data),
      		musicStop: () => music.stop (data),
			previousMusic : () => music.musicDirection (data, "previous"),
			nextMusic : () => music.musicDirection (data , "next"),
			voiceChange: () => voiceChange(),
			doMapping: () => musicMapping(data.action.music, (data?.onClient ? callback : null))			
		};
		
		info("sonosPlayer:", data.action.command, L.get("plugin.from"), data.client, L.get("plugin.to"), data.toClient );
		
		tblCommand[data.action.command]();
	} catch (err) {
		if (data.client) Avatar.Speech.end(data.client);
		if (err) error(err.message || err);
	}

	if (!data?.onClient) callback();
 
}


/**
 * Discovers Sonos devices on the network and adds them to the manager.
 * @returns {Promise<void>} - A promise that resolves when the discovery process is complete.
 * 
 * @remarks
 * This function scans for Sonos devices on the network. If a device is found, it is added to the manager.
 * If a Playbar is found, it replaces any existing device with the same name.
 * The discovery process is automatically stopped after a specified time.
 * The function checks if a client with the same name of the player exists. 
 * If so, the player is added to the manager; otherwise, a notification appears in the console and the player is ignored.
 */
async function sonosDiscovery() {
	try {
		info(Locale.get("players.scanPlayers"));
		DeviceDiscovery(async (device) => {
			const periph = await device.deviceDescription();
			if (!_.contains(Config.modules.sonosPlayer.ignoreDevices, periph.roomName)) {
				const player = manager.findDevice(periph.roomName);
				if (!player) {
					info(Locale.get(["players.foundPlayer", periph.roomName, periph.displayName]));
					manager.addDevice(periph, device);
				} else if (player.type !== 'Playbar' && periph.displayName === 'Playbar') {
					// If the device is a Playbar, we replace it if there is another device with the same name.
					// A Playbar groups all players of the client
					if (manager.findDevice(periph.roomName)) {
						info(Locale.get(["players.removePlayer", periph.roomName, periph.roomName]));
						manager.removeDevice(periph.roomName);
					} else {
						info(Locale.get(["players.foundPlaybar", periph.roomName]));
					}
					manager.addDevice(periph, device);
				}
			}
		});
	} catch (err) {
		error(Locale.get(["error.searchForPlayer", err || 'unknow']));
	}
}



/**
 * Changes the current voice setting for the Sonos player.
 * 
 * This function checks if the voice module is active and has a list of active voices.
 * If the current voice is not in the list or is the last in the list, it sets the current voice to the first in the list.
 * Otherwise, it sets the current voice to the next one in the list.
 * 
 * If the current voice is not set, it defaults to "by default".
 * The updated configuration is then written to a file.
 * 
 * @throws Will throw an error if the configuration file cannot be written.
 */
function voiceChange() {

	if (Config.modules.sonosPlayer.voice && Config.modules.sonosPlayer.platform[process.platform].voice.active && typeof Config.modules.sonosPlayer.platform[process.platform].voice.active === 'object' && (Config.modules.sonosPlayer.platform[process.platform].voice.active).length > 0) {
	  if (Config.modules.sonosPlayer.platform[process.platform].voice.active.indexOf(Config.modules.sonosPlayer.platform[process.platform].voice.current) === -1 || Config.modules.sonosPlayer.platform[process.platform].voice.active.indexOf(Config.modules.sonosPlayer.platform[process.platform].voice.current) === (Config.modules.sonosPlayer.platform[process.platform].voice.active.length - 1)) {
		Config.modules.sonosPlayer.platform[process.platform].voice.current = Config.modules.sonosPlayer.platform[process.platform].voice.active[0];
	  } else {
		Config.modules.sonosPlayer.platform[process.platform].voice.current = Config.modules.sonosPlayer.platform[process.platform].voice.active[Config.modules.sonosPlayer.platform[process.platform].voice.active.indexOf(Config.modules.sonosPlayer.platform[process.platform].voice.current) + 1];
	  }
  
	  // Just to prevent an error...
	  if (!Config.modules.sonosPlayer.platform[process.platform].voice.current) Config.modules.sonosPlayer.platform[process.platform].voice.current = "by default";
	  	
	  fs.writeJsonSync(__dirname + '/sonosPlayer.prop', {"modules": {"sonosPlayer": Config.modules.sonosPlayer}});
	}
}


/**
 * Selects a random text-to-speech (TTS) element from the given object and removes it from the object.
 *
 * @param {Object} elem - The object containing TTS elements.
 * @returns {*} - The randomly selected TTS element.
 */
function randomeTTS(elem) {
	let tab = Object.values(elem);
	let randomIndex = Math.floor(Math.random() * tab.length);
	return tab.splice(randomIndex, 1)[0];
}  


/**
 * Sends an intercom message to specified clients or all clients.
 *
 * @param {string} fromClient - The ID of the client sending the intercom message.
 * @param {string} client - The ID of the client to receive the intercom message, or 'all' to send to all clients.
 * @param {number} duration - The duration of the intercom message.
 * @param {Array<string>} alreadyPlayedTo - An array of client IDs that have already received the intercom message.
 * @returns {Promise<void>} - A promise that resolves when the intercom message has been sent.
 */
export async function subclassIntercom(fromClient, client, duration, alreadyPlayedTo) {

	let music = duration+'@@'+'/intercom/intercom.wav';
	if (fromClient !== client) Avatar.Speech.end(fromClient, true);
	if (client === 'all') {
		info (Locale.get("intercom.generalIntercom"));

		const devices = manager.getAllDeviceIds();
		for (let i in devices) {
			if (fromClient !== devices[i]
				&& !_.contains(alreadyPlayedTo, devices[i]) 
				&& !_.contains(Config.modules.sonosPlayer.intercom.ignoreDevices, devices[i])) 
			{
				info (Locale.get(["intercom.intercomSent", fromClient, devices[i]]));
				Avatar.play(music, devices[i], 'url', null, null, fromClient);
			}
		}
	} else if (client) {
		info (Locale.get(["intercom.intercomSent", fromClient, client]));
		Avatar.play(music, client, 'url', null, null, fromClient);
	} else {
		warn (Locale.get(["error.noPlayClient", fromClient, client]));
	}

}


/**
 * Modifies the `Avatar.play` method to handle audio file playback for Sonos clients.
 * If the client is not a Sonos player, it falls back to the default `Avatar.play` function.
 * 
 * @async
 * @function subclassPlay
 * 
 * @remarks
 * This function modifies the `Avatar.play` method to handle audio file playback for Sonos clients.
 * It checks if the client is a Sonos player and handles playback accordingly.
 * 
 * @param {string} playfile - The audio file to play.
 * @param {string} client - The client for which the audio file should be played.
 * @param {string} [type] - The type of playback (e.g., 'url').
 * @param {function|boolean|string} [end] - Callback or end of playback indicator.
 * @param {function|boolean|string} [callback] - Callback or end of playback indicator.
 * @param {string} [fromClient] - The client that sent the intercom.
 * 
 * @returns {Promise<void>} - A promise that resolves when playback is complete.
 */
export async function subclassPlay() {
	
	const defaultPlay = Avatar.play;

    Avatar.play = async function() {

		let callback, end;
		let file = typeof arguments[0] === 'string' ? arguments[0] : null;
		let client = typeof arguments[1] === 'string' ? arguments[1] : null;
		let type = typeof arguments[2] === 'string' && arguments[2] !== 'before' && arguments[2] !== 'after' ? arguments[2]: null;
		if (arguments[3] !== undefined) {
			if (typeof arguments[3] === 'function') callback = arguments[3];
			if (typeof arguments[3] === 'boolean' || (typeof arguments[3] === 'string' && arguments[3] === 'before' || arguments[3] === 'after')) end = arguments[3];
		}
		if (arguments[4] !== undefined) {
			if (typeof arguments[4] === 'function') callback = arguments[4];
			if (typeof arguments[4] === 'boolean' || (typeof arguments[4] === 'string' && arguments[4] === 'before' || arguments[4] === 'after')) end = arguments[4];
		}

		// Ack Intercom fromClient is the client who sent the intercom, need it to find the wav file
		// shared server. Need to be included in the partage property OF THE CLIENT !!
		let fromClient = (arguments[5] !== undefined && typeof arguments[5] === 'string') ? arguments[5] : null; // Intercom

		if (!client) {
			error(Locale.get("error.noPlayClient"));
			if (callback) {
				callback();
			}
			return;
		}
		if (!file) {
			error(Locale.get("error.noplayFile"));
			if (callback) {
				callback();
			}
			return;
		}
		
		if (!fromClient && !Avatar.Socket.isServerSpeak(Avatar.getTrueClient(client))) {
			return defaultPlay(file, client, type, end, callback);
		}

		end = end === null ? true : end;

		if (!Config.modules.sonosPlayer.platform[process.platform].partage || !Config.modules.sonosPlayer.platform[process.platform].sharedFolder) {
			error(Locale.get("error.noPartage"));
			Avatar.Speech.end(client, true);
			if (callback) {
				callback();
			}
			return;
		}

		// Ack for Sonos - if it's a mobile client, we need to find the true client
		if (Avatar.isMobile(client)) client = Config.default.client;
		
		const playFileFolder = file.split('@@')[1] || file.split('@@')[0];
		let playFileWithFolder = '';
		let playfile = '';
		// file = 'share:SB-PORTABLE[c:]/sharedSonos@@'+'/test/audio.wav';
        if (file.indexOf('@@') !== -1) {

			let sharedFolder = file.split('@@')[0];

			if (!_.isNaN(parseFloat(sharedFolder))) {
				// Special for Intercom: The intercom sends the duration with the intercom file.
				playfile = '//'+Config.modules.sonosPlayer.platform[process.platform].partage+playFileFolder;
				playFileWithFolder = parseFloat(sharedFolder);
			} else if (sharedFolder.indexOf('share:') !== -1) {
				// Shared directory passed along with the file name
				// e.g.: const sharedFolder = 'share:SB-PORTABLE[c:]/sharedSonos';
				// The directory must be at the root level
				// If after "share:" there is a (c:), then it's a Windows drive letter
				// otherwise, it's "/" by default
				const bracketMatch = sharedFolder.match(/\[([^[]*)\]/);
				let bracketValue = '';
				if (bracketMatch) {
					bracketValue = bracketMatch[1]; // "c:"
				}
				// Construct the shared folder
				sharedFolder = sharedFolder.replace(/^(?:share:)|\[[^\]]*\]/g, '');

				playfile = '//'+sharedFolder+playFileFolder;
				playFileWithFolder = bracketValue+'/'+sharedFolder.split('/')[1]+playFileFolder;
			} 
        } 

		if (!playfile && !playFileWithFolder) {
			// By default with the sharedFolder defined in the properties
			playfile = '//'+Config.modules.sonosPlayer.platform[process.platform].partage+playFileFolder;
			playFileWithFolder = Config.modules.sonosPlayer.platform[process.platform].sharedFolder + '/' + playFileFolder;
		}

		const player = manager.findDevice(client);
		if (player) {

			if (end === 'before') {
				if (!fromClient && !Avatar.Socket.isMobile(client)) {
					Avatar.Speech.end(client, true);
				}
				if (callback) {
					callback();
				}
			}

			try {
				if (end !== 'before') {
					const state = await player.device.getCurrentState();
					const wasPlaying = (state === 'playing' || state === 'transitioning');
					const mediaInfo = await player.device.avTransportService().CurrentTrack().catch(() => null);
					
					await handleBackupPreset (player, client, mediaInfo, wasPlaying, fromClient);
				}	
			} catch {
					// Empty track for TV generates an error... ignore
				await handleBackupPreset (player, client, null, false, fromClient);
			} finally {
				play(player, client, playfile, end, callback, playFileWithFolder, fromClient);
			}
		} else {
			Avatar.Speech.end(client, true);
			error(Locale.get(["error.noPlayer", "Sonos Play:", client]));
			if (callback) callback();
		}
	}
}



/**
 * Overrides the default Avatar speak function to integrate with Sonos player.
 * 
 * This function replaces the Avatar.speak method with a custom implementation
 * that checks if the client is a Sonos player and handles text-to-speech (TTS)
 * accordingly. If the client is not a Sonos player, it falls back to the default
 * Avatar speak function.
 * 
 * @async
 * @function subclassSpeak
 * 
 * @remarks
 * The function modifies the Avatar.speak method to handle TTS for Sonos players.
 * It checks the type and number of arguments to determine the TTS message, client,
 * callback function, and whether to end the speech. It also handles random TTS
 * options and integrates with the Sonos player to manage playback state and media
 * information.
 * 
 * @throws {Error} If no client or TTS message is provided.
 */
export function subclassSpeak() {

	// Backup the default Avatar.speak method
  	const defaultSpeak = Avatar.speak;

  	Avatar.speak = async function(tts, client, ...args) {

		let options = {};
		let callback = null;
		let end = true;

		for (let n of args) {
			if (typeof n === 'function') callback = n;
			if (typeof n === 'boolean') end = n;
			if (typeof n === 'object')  options = n;
		}

		if (!client) {
			error(Locale.get("error.noClient"));
			if (callback) {
				callback();
			}
			return;
		}
		if (!tts) {
			Avatar.Speech.end(client, true);
			error(Locale.get("error.noTTS"));
			if (callback) {
				callback();
			}
			return;
		}
		
		const trueClient = Avatar.getTrueClient(client);
		if (!Avatar.Socket.isServerSpeak(trueClient)) {
			return defaultSpeak(tts, client, end, callback, options || {});
		}

		if (!Config.modules.sonosPlayer.platform[process.platform].partage || !Config.modules.sonosPlayer.platform[process.platform].sharedFolder) {
			const trueClient = Avatar.getTrueClient(client);
			error(Locale.get(["error.noPartage", "Sonos Speak:", trueClient]));
			Avatar.Speech.end(client, true);
			if (callback) {
				callback();
			}
			return;
		}

		if (typeof tts === 'object') {
			tts = randomeTTS(tts);
		}

		if (tts.indexOf('|') !== -1) {
			const ttsOptions = tts.split('|');
			tts = ttsOptions[Math.floor(Math.random() * ttsOptions.length)];
		}

		Avatar.Interface.tooltipSpeak({client: client, tts: tts, type: 'target'});
	
		client = trueClient;

		const player = manager.findDevice(client);
		if (player) {
			try {
				const state = await player.device.getCurrentState();
				const wasPlaying = (state === 'playing' || state === 'transitioning');
				const mediaInfo = await player.device.avTransportService().CurrentTrack().catch(() => null);
				await handleBackupPreset(player, client, mediaInfo, wasPlaying);
			} catch {
				// Global error handling (getCurrentState() or any other unexpected error)
				await handleBackupPreset(player, client, null, false);
			} finally {
				speak(player, client, tts, end, callback, options);
			}
		} else {
			Avatar.Speech.end(client, true);
			error(Locale.get(["error.noPlayer", "Sonos Speak:", client]));
			if (callback) callback();
		}
	}
}


/**
 * Sets the parent backup preset for a given client.
 * 
 * This function checks if the client is already preset. If not, it finds the device associated with the client,
 * retrieves its current state, media information, mute status, and volume, and updates the preset information.
 * 
 * @param {string} fromClient - The identifier of the client.
 * @returns {Promise<void>} A promise that resolves when the preset has been updated.
 */
function setParentBackupPreset(fromClient) {
	return new Promise(async resolve => {
		const playerPreseted = manager.isPreseted(fromClient);
		if (fromClient && !playerPreseted) {
			const player = manager.findDevice(fromClient);
			if (player) {
				try {
					const state = await player.device.getCurrentState();
					const wasPlaying = (state === 'playing' || state === 'transitioning');
					let mediaInfo = null;
					try {
						mediaInfo = await player.device.avTransportService().CurrentTrack();
					} catch {
						mediaInfo = null;
					}

					const muted = await player.device.getMuted();
					await player.device.setMuted(false);
					const volume = await player.device.getVolume();

					manager.updatePreset(fromClient, { 
						state: wasPlaying, 
						mediaInfo : mediaInfo, 
						volume: volume, 
						muted: muted, 
						preseted: true
					});
				} finally {
					resolve();	
				}
			}
		} else {
			resolve();
		}
	})
}



async function handleBackupPreset (player, client, mediaInfo, wasPlaying, fromClient) {
	return new Promise(async resolve => {
		await setParentBackupPreset(fromClient);
		const playerPreseted = manager.isPreseted(client);
		if (!playerPreseted) {
			try {
				const muted = await player.device.getMuted();
				await player.device.setMuted(false);
				const volume = await player.device.getVolume();
				manager.updatePreset(client, { 
					state: wasPlaying, 
					mediaInfo : mediaInfo, 
					volume: volume, 
					muted: muted, 
					preseted: true
				});
			} finally {
				resolve();	
			}
		} else {
			await player.device.setMuted(false);
			resolve();
		}
	})
}



/**
 * Asynchronously generates a TTS (Text-to-Speech) audio file and plays it on the specified Sonos player.
 *
 * @param {Object} player - The Sonos player object where the TTS audio will be played.
 * @param {string} client - The client identifier, which may contain spaces.
 * @param {string} tts - The text to be converted to speech.
 * @param {boolean} end - A flag indicating whether to end the speech session after playing the TTS audio.
 * @param {Function} callback - An optional callback function to be executed after the TTS audio is played.
 *
 * @returns {Promise<void>} A promise that resolves when the TTS audio has been played or an error has occurred.
 */
async function speak(player, client, tts, end, callback, options) {

    let clientFolder = (client.indexOf(' ') !== -1) ? client.replace(/ /g,"_") : client;
    clientFolder = await reformatString(clientFolder);

	if (!clientFolder) {
		error(Locale.get("error.createTTS"));
		if (end === true) {
			await transportClosure(client, () => {
				Avatar.Speech.end(client, true);
				if (callback) {
					callback();
				}
			});
		} else if (callback) {
			callback();
		}
		return;
	}

    await ttsToWav (clientFolder, tts, async (result) => {
		if (typeof result === 'object') {
			error (Locale.get(["error.noWav", result.err.stack || result.err]));
			result = false;
		}
        if (!result) {
			if (end === true) {
				await transportClosure(client, () => {
					Avatar.Speech.end(client, true);
					if (callback) {
						callback();
					}
				});
			} else if (callback) {
				callback();
			}

			error(Locale.get("error.createTTS"));
			return;
        }

		let file;
		if (process.platform === 'win32' || process.platform === 'linux') {
			file = 'speech.wav';
		} else if (process.platform === 'darwin') {
			file = 'speech.mp3';
		} 	
        play(player, client, '//'+Config.modules.sonosPlayer.platform[process.platform].partage+'/tts/speech/'+clientFolder+'/'+file, end, callback, null, null, options);
		
	}, options);
}


/**
 * Handles the transport closure for a Sonos player.
 *
 * @param {string} client - The client object representing the Sonos player.
 * @param {Function} callback - The callback function to be executed after the transport closure.
 * @param {string} fromClient - Indicates if the request is from the client.
 * @returns {Promise<void>} - A promise that resolves when the transport closure is complete.
 *
 * @throws {Error} - Throws an error if there is an issue with the transport closure.
 */
export async function transportClosure (client, callback, fromClient) {

	const playerPreseted = manager.isPreseted(client);
	if (playerPreseted) {
		const player = manager.findDevice(client);
		if (player) {
			const preset = manager.getPreset(client);
			const mediaInfo = preset.mediaInfo;
			const volume = preset.volume;
			try {

				await player.device.setVolume(volume);
				if (mediaInfo?.uri && ['x-sonosapi-stream:', 'x-rincon-stream:', 'x-sonos-htastream:', 'mp3radio:'].some(prefix => mediaInfo.uri.includes(prefix))) {
					// stream playbar
					await player.device.setAVTransportURI({ uri: mediaInfo ? mediaInfo.uri : null, onlySetUri: !preset.state });
				} else {
					await player.device.setMuted(true);
					await player.device.play();
				}

				if ( mediaInfo?.uri && 
					!['x-sonosapi-stream:', 'x-rincon-stream:', 'x-sonos-htastream:', 'mp3radio:'].some(prefix => mediaInfo.uri.includes(prefix))
				) {
					const list = await player.device.getQueue();
					if (list?.items?.length > 0 || list?.length > 0) {
						await player.device.selectQueue();
						await player.device.selectTrack(mediaInfo.queuePosition);
						if (mediaInfo.position) {
							await player.device.seek(mediaInfo.position);
						}
					}
				}

				if ( mediaInfo?.uri && 
					!['x-sonosapi-stream:', 'x-rincon-stream:', 'x-sonos-htastream:', 'mp3radio:'].some(prefix => mediaInfo.uri.includes(prefix))
				) {
					await player.device.setMuted(preset.muted);
					if (!preset.state) { 
						await player.device.pause();
					}
				}
				
			} catch (err) {
				error(Locale.get(["error.closure", err || 'unknow']));
				if (!fromClient && !Avatar.Socket.isMobile(client)) Avatar.Speech.end(client, true);
				if (fromClient && fromClient === client) Avatar.Speech.end(fromClient, true);
			} finally {
				manager.resetPreset(client);
				if (callback) callback();
			}
		} else {
			error(Locale.get(["error.noPlayer", "Sonos Speak:", client]));
			if (callback) callback();
		}
	} else {
		if (callback) callback();
	}
}


/**
 * Plays a file on the Sonos player.
 *
 * @param {Object} player - The Sonos player object.
 * @param {string} client - The client identifier.
 * @param {string} playfile - The file to be played.
 * @param {boolean} end - Whether to end the transport after playing.
 * @param {Function} callback - The callback function to be executed after playing.
 * @param {boolean} playFileWithFolder - Whether to play the file with its folder path.
 * @param {string} fromClient - The client that initiated the play request.
 * @returns {Promise<void>} - A promise that resolves when the play operation is complete.
 */
async function play(player, client, playfile, end, callback, playFileWithFolder, fromClient, args) {

	let timeoutTime = 0;
	const getTimeOut = () => {
		return new Promise( async (resolve) => {
			const duration = await speakDuration (playfile, playFileWithFolder);
			if (!duration) {
				timeoutTime = Config.modules.sonosPlayer.platform.common.defaultDuration * 1000;
				warn(Locale.get(["error.defaultDuration", (timeoutTime.toString() + 's')]));
			} else {
				timeoutTime = (Config.modules.sonosPlayer.platform[process.platform].addDuration + duration ) * 1000;
			}
			resolve();
		})
	};

	const volume =
	args?.volume ??
	Config.modules?.sonosPlayer?.platform?.common?.volume?.[client] ??
	Config.modules?.sonosPlayer?.platform?.common?.defaultVolume;

	const options = {
		uri: 'x-file-cifs:'+playfile,
		onlyWhenPlaying: false, 
		volume:  volume // Change the volume for the notification, and revert back afterwards.
	};

	try {
		await player.device.setAVTransportURI(options);
		await player.device.setVolume(options.volume);
		await getTimeOut();
	} catch (err) {
		error(Locale.get(["error.noPlay", err || "unknow"]));
	} finally {
		setTimeout(async () => {
			if (end === true || end === 'after') {
				await transportClosure(client, () => {
					if (!fromClient && !Avatar.Socket.isMobile(client)) {
						Avatar.Speech.end(client, true);
					}
					if (fromClient && fromClient === client) {
						Avatar.Speech.end(fromClient, true); 
					}
					if (callback) {
						callback();
					}
				}, fromClient);
			} else {
				if (callback) {
					callback();
				}
			}
		}, timeoutTime);
	};
}
