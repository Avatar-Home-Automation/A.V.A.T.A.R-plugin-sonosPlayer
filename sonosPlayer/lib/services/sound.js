import { doAction, resetListen } from './helper.js';

/**
 * Activates the TV sound on a Sonos player.
 *
 * @param {Object} data - The data object containing necessary information.
 * @param {string} data.toClient - The client identifier.
 * @param {Object} data.client - The client object.
 *
 * @async
 * @function activateTvSound
 */
export async function activateTvSound (data) {

    const action = async (data, player) => {
        const playerTV = player.type === 'Playbar' ? data.toClient : Config.modules.sonosPlayer.playerTV;
        if (player.id === playerTV) {
            const mediaInfo = await player.device.avTransportService().CurrentTrack();
            if ( mediaInfo?.uri && 
                !['x-sonos-htastream:'].some(prefix => mediaInfo.uri.includes(prefix))
            ) {
                let uri = player.UDN.replace("uuid","x-sonos-htastream");
                uri = uri+":spdif";
                await player.device.setAVTransportURI({ uri: uri});
                resetListen(data);
            } else {
                Avatar.speak(data.Locale.get("sound.TvPlaybar"), data.client);
            }
        } else {
            Avatar.speak(data.Locale.get(["sound.noTvRoom", data.toClient]), data.client);     
        }   
    }

    doAction(action, data, "Sonos TV Sound:");
}


/**
 * Toggles the mute state of a Sonos player.
 *
 * @param {Object} data - The data object containing client information.
 * @param {boolean} muted - The desired mute state (true to mute, false to unmute).
 * @returns {Promise<void>} - A promise that resolves when the mute state has been toggled.
 */
export async function muteOnOff (data, muted) {

    const action = async (data, player) => {
        const state = await player.device.getCurrentState();
        if (state === 'playing' || state === 'transitioning') {
            await player.device.setMuted(muted);
        } 
        resetListen(data);
    }

    doAction(action, data, "Sonos muteOnOff:");
}


/**
 * Adjusts the volume of the Sonos player based on the provided data and state.
 *
 * @param {Object} data - The data object containing information about the request.
 * @param {number} value - The value by which to increase or decrease the volume.
 * @param {boolean} [state] - The state indicating whether to increase (true) or decrease (false) the volume.
 * 
 * @returns {Promise<void>} A promise that resolves when the volume adjustment is complete.
 */
export async function volume (data, value, state) {

    const action = async (data, player) => {
        let tts;
        let volume = await player.device.getVolume();
        if (state !== undefined) {
            if (state === true) {
                volume = (volume + value) > 100 ? 100 : volume + value;
                tts = volume === 100 ? data.Locale.get("sound.maxVolume") : data.Locale.get("sound.volumeDone");
            } else {
                volume = (volume - value < 0) ? 0 : volume - value;
                tts = volume === 0 ? data.Locale.get("sound.minVolume") : data.Locale.get("sound.volumeDone");
            }
            player.device.setVolume(volume);

            if ([0, 100].includes(volume)) {
                Avatar.speak(tts, data.client);
            } else {
                resetListen(data);
            }
        } else {
            if (data?.relations?.duration?.text) {
                const parsed = parseInt(data.relations.duration.text, 10);
                if (!isNaN(parsed)) {
                    player.device.setVolume(parsed);
                    resetListen(data);
                    return;
                } 
            } 
                
            Avatar.speak(data.Locale.get("sound.noVolume"), data.client);
        }
    }

    doAction(action, data, "Sonos volume:");
    
}

