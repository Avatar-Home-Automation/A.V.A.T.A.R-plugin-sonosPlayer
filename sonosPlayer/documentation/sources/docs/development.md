# Development

## `Avatar.speak`

The `Avatar.speak` function is automatically overridden. No action is necessary.

## `Avatar.play`

A music file can only be played on Sonos if it is included in a [shared folder](shared-folder.md) that is part of the music library.

Therefore, if your plugin needs to play an audio file, you must create it in a shared folder with Sonos and then define the access format for this file in the `Avatar.play` function.

### Accessing an Audio File in the Shared Folder `sharedFolder`

You can use the shared folder defined in the `sharedFolder` property to allow Sonos access to your file.

**Format:**  `<share>@@<folder/audio file>`

**For example:**

Suppose an audio file located at _C:/avatarAudio/music/myMusic.mp3_:

1. The shared folder is _C:/avatarAudio_
2. Add a folder _C:/avatarAudio/music_ and create (or copy) your audio file into this folder.
3. In the plugin, add the `Avatar.play` function as shown below:

```js
const music = Config.modules.sonosPlayer.platform.win32.sharedFolder+'@@/music/myMusic.mp3';
Avatar.play(music, client, "before");
```

The shared folder is defined by the `sharedFolder` property  
_end_ = "before" to resume client listening before playing the file (optional; if not specified, the client's listening is resumed after playback)

**Another example:**

```js
const music = Config.modules.sonosPlayer.platform.win32.sharedFolder+'@@/music/myMusic.mp3';
Avatar.play(music, client, () => {
    // Do stuff
});
```

The shared folder is defined by the `sharedFolder` property  
_end_ = null, meaning the client's listening is resumed after playback  
_callback_ is executed after the file has been played.

**Note:**

The shared folder `sharedFolder` is defined by default and is optional. To play this file, you can also define:


```js
const music = '/music/myMusic.mp3';
Avatar.play(music, client);
```

The shared folder is defined by default (the `sharedFolder` property)  
_end_ = null, meaning the client's listening is resumed after playback

### Accessing an Audio File in Another Shared Folder

You can also use a different shared folder than the `sharedFolder` property.

**Format:**  `share:<pc_name_or_ip>/<share>@@<folder/audio file>`

**For example:**

Suppose an audio file is located at _C:/musicLibrary/rock/myMusic.mp3_:

1. The PC name is _AVATAR-SERVER_
2. The shared folder where the audio file is located is _C:/musicLibrary_
3. In the plugin, add the `Avatar.play` function as shown below:

```js
const music = 'share:AVATAR-SERVER/musicLibrary@@/rock/myMusic.mp3';
Avatar.play(music, client, "before");
```

The shared folder is _C:/musicLibrary_ on the AVATAR-SERVER  
_end_ = "before" to resume client listening before playing the file (optional; if not specified, the client's listening is resumed after playback)

#### Special Case for Windows

If the drive letter is different from C:, you can specify it by adding it after the PC name in brackets, as shown below:

```js
const music = 'share:AVATAR-SERVER[D:]/musicLibrary@@/rock/myMusic.mp3';
Avatar.play(music, client);
```

The shared folder is _/musicLibrary_ on the AVATAR-SERVER and on drive D:  
_end_ = null, meaning the client's listening is resumed after playback

## Test Multi-Room

When developing, it's good to test whether the client is using its own speaker or is configured to use a Sonos Player.

To do this, you can use the [`Avatar.Socket.isServerSpeak()`](https://avatar-home-automation.github.io/docs/API-server/#avatarsocketisserverspeakclient) function as shown below:

```js
if (!Avatar.Socket.isServerSpeak(client)) {
    // The client has its own speaker
    
    // sets static folder on the server
    Avatar.static.set('C:/avatarAudio', () => {
        const music = `http://${Config.http.ip}:${Config.http.port}/music/myMusic.mp3`;
        Avatar.play(music, client, 'local', 'before', () => {
            // do stuff if needed
        });    
    });
} else {
    // The client is using a Sonos Player
    const music = Config.modules.sonosPlayer.platform.win32.sharedFolder+'@@/music/myMusic.mp3';
    Avatar.play(music, client, 'before', () => {
        // do stuff if needed
    });
}
```