/* Copyright (c) 2015 William Toohey <will@mon.im>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

// Flash value + MAGIC WEB VALUE
var LAME_DELAY_START = 2258;
var LAME_DELAY_END = 1000;

function SoundManager() {
    this.playing = false;
    
    /* Lower level audio and timing info */
    this.bufSource = null;
    this.buffer = null;
    this.context = null; // Audio context, Web Audio API
    this.startTime = 0;  // File start time - 0 is loop start, not build start
    
    // Volume
    this.gainNode = null;
    this.mute = false;
    this.lastVol = 1;
    
    // In case of API non-support
    this.canUse = true;
    
    // Check Web Audio API Support
    try {
        // More info at http://caniuse.com/#feat=audio-api
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.context = new window.AudioContext();
        this.gainNode = this.context.createGain();
        this.gainNode.connect(this.context.destination);
    } catch(e) {
        this.canUse = false;
        this.errorMsg = "Web Audio API not supported in this browser.";
        return;
    }
    var audio  = document.createElement("audio"),
    canPlayMP3 = (typeof audio.canPlayType === "function" &&
              audio.canPlayType("audio/mpeg") !== "");
    if(!canPlayMP3) {
        this.canUse = false;
        this.errorMsg = "MP3 not supported in this browser.";
        return;
    }
    
    var that = this;
    window.addEventListener('touchend', function() {
        // create empty buffer
        var buffer = that.context.createBuffer(1, 1, 22050);
        var source =  that.context.createBufferSource();
        source.buffer = buffer;

        // connect to output (your speakers)
        source.connect( that.context.destination);

        // play the file
        source.noteOn(0);

    }, false);
}

SoundManager.prototype.playSong = function(arrayBuffer, callback) {
    var that = this;
    this.stop();
    
    this.context.decodeAudioData(arrayBuffer, function(buffer) {
        that.buffer = that.trimMP3(buffer);
        that.bufSource = that.context.createBufferSource();
        that.bufSource.buffer = that.buffer;
        that.bufSource.loop = true;
        that.bufSource.connect(that.gainNode);
        
        // This fixes sync issues on Firefox and slow machines.
        that.context.suspend().then(function() {
            that.bufSource.start(0);
            that.startTime = that.context.currentTime;
            that.context.resume().then(function() {
                that.playing = true;
                if(callback) {
                    callback();
                }
            });
        });
    }, function() {
        console.log('Error decoding audio.');
    });
}

SoundManager.prototype.stop = function() {
    if (this.playing) {
        // arg required for mobile webkit
        this.bufSource.stop(0);
        this.bufSource.disconnect(); // TODO needed?
        this.bufSource = null;
        this.playing = false;
        this.startTime = 0;
    }
}

// In seconds, relative to the loop start
SoundManager.prototype.currentTime = function() {
    if(!this.playing) {
        return 0;
    }
    return this.context.currentTime - this.startTime;
}

SoundManager.prototype.currentProgress = function() {
    return this.currentTime() / this.buffer.duration;
}

// because MP3 is bad, we nuke silence
SoundManager.prototype.trimMP3 = function(buffer) {
    // Firefox has to trim always
    var isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    if(!(isFirefox)) {
        return buffer;
    }
    var start = LAME_DELAY_START;
    var newLength = buffer.length - LAME_DELAY_START - LAME_DELAY_END;
    var ret = this.context.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);
    for(var i=0; i<buffer.numberOfChannels; i++) {
        var oldBuf = buffer.getChannelData(i);
        var newBuf = ret.getChannelData(i);
        for(var j=0; j<ret.length; j++) {
            newBuf[j] = oldBuf[start + j];
        }
    }
    return ret;
}

SoundManager.prototype.setMute = function(mute) {
    if(!this.mute && mute) { // muting
        this.lastVol = this.gainNode.gain.value;
        this.gainNode.gain.value = 0;
    } else if(this.mute && !mute) { // unmuting
        this.gainNode.gain.value = this.lastVol;
    }
    this.mute = mute;
    return mute;
}

SoundManager.prototype.toggleMute = function() {
    return this.setMute(!this.mute);
}

SoundManager.prototype.decreaseVolume = function() {
    this.setMute(false);
    val = Math.max(this.gainNode.gain.value - 0.1, 0);
    this.gainNode.gain.value = val;
}

SoundManager.prototype.increaseVolume = function() {
    this.setMute(false);
    val = Math.min(this.gainNode.gain.value + 0.1, 1);
    this.gainNode.gain.value = val;
}

SoundManager.prototype.setVolume = function(vol) {
    this.gainNode.gain.value = vol;
}