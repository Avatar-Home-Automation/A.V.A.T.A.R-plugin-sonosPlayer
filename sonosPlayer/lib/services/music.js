import { manager } from '../../sonosPlayer.js';
import { SonosAPI } from './services.js';
import { Helpers } from '../sonos/sonos.js';
import { doAction, resetListen, musicMapping, addMapping} from './helper.js';

const API = new SonosAPI(Config.modules.sonosPlayer.mappingTTS, Config.modules.sonosPlayer.mappingRules);


/**
 * Prompts the user to search for music or radio and plays the selected item.
 * 
 * @param {Object} data - The data object containing client information.
 * @param {string} type - The type of search to perform ('music' or 'radio').
 * 
 * @returns {Promise<void>} - A promise that resolves when the search and playback are complete.
 * 
 * @remarks
 * This function prompts the user to specify what they want to listen to. It then searches for the specified music or radio and plays it on the Sonos device.
 * If no player is found for the specified client, an error message is displayed.
 * 
 * @example
 * // Usage
 * await search({ client: 'clientName', toClient: 'clientName' }, 'music');
 */
export async function search (data, type, music) {

    const player = manager.findDevice(data.toClient); 
    if (player) {

        if (!Config.modules.sonosPlayer["search"][data.language]) {
            Avatar.speak(data.Locale.get("music.noLanguage"), data.client);
            return;
        }

        const volume = await player.device.getVolume();

        const askmeKeys = { ...{"*": "generic"}, ...Config.modules.sonosPlayer["search"][data.language] };
        Avatar.askme(data.Locale.get("music.askme"), data.client,
            askmeKeys, 0, async function (answer, end) {

                end(data.client);

                if (answer && answer.indexOf('generic') != -1) {
                    answer = answer.split(':')[1];
                    
                    answer = API.searchCorrespondence(answer);
                    
                    if (type === 'music') {
                        await searchMusic(data, player, answer, type, volume);
                    } else {
                        await searchRadio(data, player, answer, type, volume);
                    }
                    return;
                }

                switch(answer) {  
                    case 'musicMapping':
                        if (music) {
                            await setMusicMapping(music, data);
                            Avatar.speak(data.Locale.get("music.doMapping"), data.client);
                        } else {
                            Avatar.speak(data.Locale.get("music.noMapping"), data.client, () => {
                                search (data, type);
                            }, false);
                        }
                        break;
                    case "musicRandom":
                        if (type === 'music') {
                            musicRandom(data, player, type, volume);
                        } else {
                            Avatar.speak(data.Locale.get("music.noChoice"), data.client, () => {
                                search (data, type);
                            }, false);
                        }
                        break;
                    case "done":
                    default:
                        Avatar.speak(data.Locale.get("music.done"), data.client);
                }
            })
    } else {
        if (Avatar.isMobile(data.client)) {
            Avatar.Socket.getClientSocket(data.client).emit('askme_done');
        } else {
            Avatar.Speech.end(data.client, true);
        }
        error(data.Locale.get(["error.noPlayer", "Sonos Search:", data.client]));
    }

}


/**
 * Sets the music mapping for the specified client.
 *
 * @param {Object} music - The music object to be mapped.
 * @param {Object} data - The data object containing client information.
 * @returns {Promise<void>} - A promise that resolves when the mapping is complete.
 */
async function setMusicMapping(music, data) {

    if (Config.modules.sonosPlayer.mappingOnServer.includes(data.client) 
        || Config.modules.sonosPlayer.mappingOnServer.includes('all')) {
        await musicMapping(music);
    } else {
        Avatar.clientPlugin(data.client, 'sonosPlayer', {
            language: Config.language,  
            onClient: true, 
            client: data.client, 
            toClient: data.toClient, 
            action: {command: 'doMapping', music: music}
        }, (mapping) => {
            addMapping(mapping);
        });
    }

}


/**
 * Searches for music based on the provided data and plays the selected music.
 *
 * @param {Object} data - The data object containing information about the search request.
 * @param {Object} player - The player object representing the Sonos device.
 * @param {string} music - The name of the music to search for.
 * @param {string} type - The type of search to perform.
 * @returns {Promise<void>} - A promise that resolves when the search and playback are complete.
 * @throws {Error} - Throws an error if the search or playback fails.
 */
async function searchMusic (data, player, music, type, volume) {

    try {
        let items = await getMusicLibrary(data.language, player.device, music);
        items = await getFavorites(data.language, items, player.device, music);
        items = await searchMusicLibraries(data.language, items, player.device, music);
        
        if (typeof items === 'number' || (typeof items === 'object' && items.length === 0)) {
            Avatar.speak(data.Locale.get("music.notFound"), data.client, () => {
                search (data, type, music);
            }, false);
            return;
        }

        music = API.getLexic(music);
        if (items.length > 1)  {
            // not sure, to be tested...
            
            Avatar.speak('J\'ai trouvé '+items.length+' albums pour '+music+'. Tu devrais gérer une sélection.', data.client, () => {
              //searchForMultipleAlbums (data, items, 0, null, (item) => {
                //Avatar.speak('Je mets '+music, data.client, () => {
                    //await playMusic(data, player, item);
                //});
              //});
              Avatar.Speech.end(data.client, true); 
            }, false);
            return;

        } else {
            await new Promise((resolve, reject) => {
                //data.Locale.get(["music.found", music])
                const voice = Config.modules.sonosPlayer.platform[process.platform].voice?.musicTitleVoice 
                ? {voice: Config.modules.sonosPlayer.platform[process.platform].voice.musicTitleVoice}
                : null;

                Avatar.speak(music, data.client, async () => {
                    try {
                        await playMusic(data, player, items[0], volume);
                        resolve();
                    } catch (err) {
                        reject(err); 
                    }
                }, false, voice);
            })
        }

    } catch (err) {
        setError ('searchMusic:');  
    }
}


function setError (from) {
    Avatar.speak(data.Locale.get("error.music"), data.client, () => {
        if (Avatar.isMobile(data.client))
            Avatar.Socket.getClientSocket(data.client).emit('askme_done');
    });
    error(from, err || err.stack);
}


/**
 * Searches for radio stations based on the provided data and plays the selected station.
 *
 * @param {Object} data - The data object containing information about the search request.
 * @param {Object} player - The player object representing the Sonos device.
 * @param {string} music - The name of the music or radio station to search for.
 * @param {string} type - The type of search to perform.
 * @returns {Promise<void>} - A promise that resolves when the search and playback are complete.
 * @throws {Error} - Throws an error if the search or playback fails.
 */
async function searchRadio (data, player, music, type, volume) {
    
    try {

        const items = await getRadioFavorites(data.language, player.device, music);
        
        if (typeof items === 'number' || (typeof items === 'object' && items.length === 0)) {
            Avatar.speak(data.Locale.get("music.notFound"), data.client, () => {
                search (data, type, music);
            }, false);
            return;      
        }

        music = API.getLexic(music);
        if (items.length > 1)  {

            Avatar.speak('J\'ai trouvé '+items.length+' radios pour '+music+'. Tu devrais gérer une selection', data.client, () => {
              //searchForMultipleAlbums (data, items, 0, null, (item) => {
                //Avatar.speak('Je mets '+music, data.client, () => {
                    //await playMusic(data, player, item);
                //});
              //});
              Avatar.Speech.end(data.client, true); 
            }, false);
            return;

        } else {

            await new Promise((resolve, reject) => {
                Avatar.speak(data.Locale.get(["music.found", music]), data.client, async () => {
                    try {
                        await playMusic(data, player, items[0], volume);
                        resolve();
                    } catch (err) {
                        reject(err); 
                    }
                }, false);
            });

        }

    } catch (err) {
        setError ('searchRadio:');   
    }
}


/**
 * Retrieves the radio favorites from a Sonos device that match a given search term.
 *
 * @param {string} language - The language to use for matching terms.
 * @param {Object} device - The Sonos device instance to retrieve favorites from.
 * @param {string} searchTerm - The term to search for within the radio favorites.
 * @returns {Promise<Object[]|number>} A promise that resolves to an array of matching radio favorites, or 0 if no matches are found.
 */
async function getRadioFavorites (language, device, searchTerm) {
    try {
        let list = await device.getFavorites();
        if (!list?.items || list.returned == 0) {
            return 0;
        }

        list.items = list.items.filter(item => {
            return (item.uri && item.uri.startsWith('x-sonosapi-stream:'))
                || (item.uri && item.uri.startsWith('x-rincon-mp3radio:'))
        })

        list.items = API.matchTerm(language, list.items, searchTerm);
        list.returned = list.items.length;

        return list.returned === 0 ? 0 : list.items;
    } catch (err) {
        throw err;
    }
}



/**
 * Retrieves the music library from a Sonos device and filters it based on a search term.
 *
 * @param {string} language - The language to use for matching the search term.
 * @param {Object} device - The Sonos device from which to retrieve the music library.
 * @param {string} searchTerm - The term to search for within the music library.
 * @returns {Promise<Object[]|number>} A promise that resolves to the filtered list of music items or 0 if no items match the search term.
 */
async function getMusicLibrary (language, device, searchTerm) {
    try {
        const list = await device.getMusicLibrary('sonos_playlists')
        if (!list?.items || list.returned === 0) {
            return 0;
        }

        list.items = API.matchTerm(language, list.items, searchTerm);
        list.returned = list.items.length;

       return list.returned === 0 ? 0 : list.items;
    } catch (err) {
        throw err;
    }
}


/**
 * Retrieves the favorite items from a device, optionally filtered by a search term.
 *
 * @param {string} language - The language to use for matching the search term.
 * @param {number|any} item - If a number, it triggers the retrieval of favorites from the device. Otherwise, it resolves with this item.
 * @param {Object} device - The device object from which to retrieve the favorites.
 * @param {string} searchTerm - The term to filter the favorite items.
 * @returns {Promise<number|Array>} - A promise that resolves to the filtered list of favorite items or 0 if no items match the search term.
 */
async function getFavorites(language, item, device, searchTerm) {
    try {
        if (typeof item === 'number') {
            const list = await device.getFavorites();
            if (!list?.items || list.returned == 0) {
                return 0;
            }

            list.items = API.matchTerm(language, list.items, searchTerm);
            list.returned = list.items.length;

            return list.returned === 0 ? 0 : list.items;
        } else {
            return item;
        }
    } catch (err) {
        throw err;
    }
}


/**
 * Searches music libraries based on the provided search term.
 *
 * @param {string} language - The language to use for the search.
 * @param {number|Array} items - The items to search through, or a number indicating the type of search.
 * @param {Object} device - The device to perform the search on.
 * @param {string} searchTerm - The term to search for in the music libraries.
 * @returns {Promise<Array|number>} A promise that resolves with the search results or rejects with an error.
 */
async function searchMusicLibraries (language, items, device, searchTerm) {
    if (typeof items === 'number') {
        return await searchMusicLibrary(language, device, 0, searchTerm, list => {
            if (!list || (list && (typeof list === 'object' &&  list.length > 0 && !list[0]?.uri))) {
                return 0;
            }
            return list;
        });
    } else {
        return items;
    }
}


/**
 * Searches the music library on a Sonos device.
 *
 * @param {string} language - The language to use for matching terms.
 * @param {object} device - The Sonos device to search on.
 * @param {number} searchPos - The current position in the search types array.
 * @param {string} searchTerm - The term to search for in the music library.
 * @param {function} callback - The callback function to call with the search results or an error.
 *
 * @returns {Promise<void>} - A promise that resolves when the search is complete.
 */
async function searchMusicLibrary (language, device, searchPos, searchTerm, callback) {

    let searchTypes = Config.modules.sonosPlayer.musicTypes.search;
    if (searchPos === searchTypes.length) {
        return callback();
    }

    try {
        const list = await device.searchMusicLibrary(searchTypes[searchPos], searchTerm, {});
        if (!list?.items  || (list.items && list.items.length === 0)) {
            return searchMusicLibrary (language, device, ++searchPos, searchTerm, callback);
        }

        list.items = API.matchTerm(language, list.items || list, searchTerm);
        list.returned = list.items.length;

        if (list.returned === 0) {
            return searchMusicLibrary (language, device, ++searchPos, searchTerm, callback);
        } 

        return callback(list.items || list);
    } catch (err) {
        throw err;
    }
}


/**
 * Plays random music from the Sonos music library.
 *
 * @async
 * @function musicRandom
 * @param {Object} data - The data object containing client information.
 * @param {Object} player - The player object containing device information.
 * @param {string} type - The type of search to perform.
 * @returns {Promise<void>}
 * @throws Will log an error message to the console if an error occurs.
 */
async function musicRandom (data, player, type, volume) {
    try {
        const choice = Config.modules.sonosPlayer.musicTypes.random[Math.floor(Math.random() * Config.modules.sonosPlayer.musicTypes.random.length)];
        const item = await getRandomMusicLibrary(player.device, choice);

        if (typeof item === 'number') {
            Avatar.speak(data.Locale.get("music.noRandom"), data.client, () => {
                search (data, type);
            }, false);
            return;      
        }

        const music = API.getLexic(item.name || item.title);
        await new Promise((resolve, reject) => {
            Avatar.speak(data.Locale.get(["music.found", music]), data.client, async () => {
                try {
                    await playMusic(data, player, item, volume);
                    resolve();
                } catch (err) {
                    reject(err); 
                }
            }, false);
        });

    } catch (err) {
        setError ('musicRandom:');  
    }
}



/**
 * Retrieves a random item from the specified music library type of a given device.
 *
 * @param {Object} data - The data object (not used in the function).
 * @param {Object} device - The device object which has the method to get the music library.
 * @param {string} type - The type of music library to retrieve (e.g., 'artists', 'albums', 'tracks').
 * @returns {Promise<Object|number>} - A promise that resolves to a random item from the music library, or 0 if the library is empty.
 */
async function getRandomMusicLibrary (device, type) {
    try {
        const list = await device.getMusicLibrary(type);
        if (!list?.items || list.returned === 0) {
            return 0;
        }

        const item = list.items[Math.floor(Math.random() * list.items.length)];
        return item;
    } catch (err) {
        throw err;
    }
}


/**
 * Plays music on the specified player.
 *
 * @param {Object} data - The data object containing client information.
 * @param {Object} player - The player object to control the music playback.
 * @param {Object} item - The music item to be played.
 * @param {string} item.uri - The URI of the music item.
 * @param {string} volume - The volume of the player.
 * @param {string} [item.title] - The title of the music item.
 * @param {boolean} spotify - Indicates if the music item is from Spotify.
 * @returns {Promise<void>} A promise that resolves when the music starts playing.
 * @throws Will throw an error if the music item URI is not provided or if there is an issue during playback.
 */
async function playMusic(data, player, item, volume, spotify) {

    if (!item?.uri) {
        throw new Error(data.Locale.get("error.url"));
    }

    // needed by spotify
    if (spotify)
        player.device.setSpotifyRegion(SpotifyRegion[Config.modules.sonosPlayer.Spotify.region]);

    // FIX
    if (!item.uri.includes('spotify:user:spotify:playlist:') && item.uri.includes('spotify:playlist:')) {
        item.uri = `spotify:user:${item.uri}`;
    }
    
    const list = await player.device.getQueue();
    if (list.returned !== '0' || list?.items) {
        await player.device.selectQueue();
        await player.device.flush();
    }

    await Helpers.GenerateMetadata(item.uri, item.title || "");
    await player.device.play(item.uri);
    await player.device.setVolume(volume);
    await player.device.setMuted(false);
    resetListen(data);
   
}


/**
 * Plays music on the Sonos player.
 *
 * @param {Object} data - The data object containing information for the action.
 * @param {Object} data.client - The client information.
 * @returns {Promise<void>} - A promise that resolves when the action is complete.
 */
export async function play (data) {

    const action = async (data, player) => {

        const list = await player.device.getQueue();
        if (list.returned === '0' || !list?.items) {
            Avatar.speak(data.Locale.get("music.listEmpty"), data.client, () => {
                return;
            });
        }

        const volume = await player.device.getVolume();
        await new Promise(async (resolve, reject) => {
            Avatar.speak(data.Locale.get("music.play"), data.client, async () => {
                try {
                    await player.device.selectQueue();
                    await player.device.play();
                    await player.device.setVolume(volume);
                    await player.device.setMuted(false);
                    resetListen(data);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            }, false);
        });
    }

    doAction(action, data, "Sonos Play:");

}


/**
 * Stops the music playback on the Sonos player.
 *
 * @param {Object} data - The data object containing information about the request.
 * @param {Object} data.client - The client information.
 * @returns {Promise<void>} - A promise that resolves when the action is complete.
 */
export async function stop (data) {

    const action = async (data, player) => {
        await new Promise(async (resolve, reject) => {
            Avatar.speak(data.Locale.get("music.stop"), data.client, async () => {
                try {
                    const state = await player.device.getCurrentState();
                    if (state === 'playing' || state === 'transitioning') {
                        await player.device.pause();
                    }
                    resetListen(data);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            }, false);
        });
    }

    doAction(action, data, "Sonos Stop:");

}


/**
 * Controls the music direction (previous or next) for a Sonos player.
 *
 * @param {Object} data - The data object containing client information.
 * @param {string} direction - The direction to control the music, either 'previous' or 'next'.
 * @returns {Promise<void>} - A promise that resolves when the action is complete.
 *
 * @example
 * // To play the next track
 * musicDirection(data, 'next');
 *
 * // To play the previous track
 * musicDirection(data, 'previous');
 */
export async function musicDirection (data, direction) {

    const action = async (data, player) => {
        const state = await player.device.getCurrentState();
        if (state === 'playing' || state === 'transitioning') {
            const mediaInfo = await player.device.avTransportService().CurrentTrack();
            if ( mediaInfo?.uri && 
                !['x-sonosapi-stream:', 'x-rincon-stream:', 'x-sonos-htastream:', 'x-rincon-mp3radio:'].some(prefix => mediaInfo.uri.includes(prefix))
            ) {
                const list = await player.device.getQueue();
                if (list.returned === '0' || !list?.items) {
                    Avatar.speak(data.Locale.get("music.listEmpty"), data.client);
                    return;
                } 

                let state = false;
                if (direction === 'previous' && mediaInfo.queuePosition > 1) {
                    state = true;
                } else if (direction === 'next' && mediaInfo.queuePosition < list.items.length) {
                    state = true;
                }
                
                if (state === true) {
                    if (direction === 'previous') {
                        await player.device.previous();
                    } else {
                        await player.device.next();
                    }
                    resetListen(data);
                } else {
                    const tts = direction === 'previous' ? data.Locale.get("music.first") : data.Locale.get("music.last");
                    Avatar.speak(tts, data.client);
                }
                
            } else {
                    Avatar.speak(data.Locale.get("music.noChange"), data.client);
            }
        } else {
            Avatar.speak(data.Locale.get("music.noPlaying"), data.client);
        }
    }

    doAction(action, data, "Sonos previousMusic:");

}

