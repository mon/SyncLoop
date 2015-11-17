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

SyncLoop = function(defaults) {
    this.defaults = defaults;
    this.toLoad = 0;
    this.loadProgress = [];
    this.audio = null;
    this.images = [];
    this.canvas = document.getElementById(defaults.canvasID).getContext("2d");
    this.lastFrame = -1;
    this.frames = [];
    
    // For custom song timing
    this.lastBeat = -1;
    this.beatOffset = 0;
    // For custom animation timing
    this.animTiming = [];
    
    var that = this;
    window.onerror = function(msg, url, line, col, error) {
        that.error(msg);
        // Get more info in console
        return false;
    };
    window.onresize = function() {
        that.resize();
    }
    
    console.log("SyncLoop init...");
    this.soundManager = new SoundManager(this);
    if(!this.soundManager.canUse) {
        this.error(this.soundManager.errorMsg);
        return;
    }
    
    this.loadResources();

    document.onkeydown = function(e){
        e = e || window.event;
        // Ignore modifiers so we don't steal other events
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
            return true;
        }
        var key = e.keyCode || e.which;
        return that.keyHandler(key);
    };
    
    this.animationLoop();
}

SyncLoop.prototype.loadResources = function(callback) {
    // anim frames + song file
    this.toLoad = this.defaults.animation.frames + 1;
    this.loadProgress = [];
    for(var i = 0; i < this.toLoad; i++) {
        this.loadProgress[i] = 0;
    }
    
    this.loadSong(this.defaults.song.filename);
    
    var img = this.defaults.animation.filename;
    // NOTE: 1 indexed
    for(var i = 1; i <= this.defaults.animation.frames; i++) {
        var n = i + '';
        var width = this.defaults.animation.frameTextPadding;
        if(width) {
            n = n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
        }
        this.loadImage(img.replace("%FRAME%", n), i);
    }
}

SyncLoop.prototype.loadComplete = function() {
    this.updateProgress();
    if(--this.toLoad <= 0) {
        this.resize();
        // for weird loop back/forwards animations
        var keyframes = this.defaults.animation.frameKeyframes;
        if(keyframes) {
            //this.frames.push(keyframes[0]-1); // first frame inclusive
            for(var i = 0; i < keyframes.length-1; i++) {
                var a = keyframes[i];
                var b = keyframes[i+1];
                if(b < a) {
                    for(var j = a; j > b; j--) {
                        this.frames.push(j-1);
                    }
                } else {
                    for(var j = a; j < b; j++) {
                        this.frames.push(j-1);
                    }
                }
            }
            this.frames.push(j-1); // last frame inclusive
        } else {
            for(var i = 0; i < this.defaults.animation.frames; i++) {
                this.frames.push(i);
            }
        }
        // back and forth, forever
        if(this.defaults.animation.pingpong) {
            this.frames = this.frames.concat(this.frames.slice(1).reverse().slice(1));
        }
        var beats = this.defaults.animation.beats;
        if(beats) {
            var i = 0;
            for(i = 1; i <= beats.length; i++) {
                var tail = undefined;
                if(i != beats.length) {
                    tail = beats[i]-1;
                }
                this.animTiming.push(this.frames.slice(beats[i-1]-1, tail));
            }
            for(i = 1; i < beats[0]; i++) {
                this.animTiming[this.animTiming.length-1].push(this.frames[i-1]);
            }
        }
        this.soundManager.playSong(this.audio, function() {
            document.getElementById("preloadHelper").className = "loaded";
        });
    }
}

SyncLoop.prototype.loadImage = function(url, index) {
    var that = this;
    img = new Image();
    img.onload = function() {
        that.loadProgress[index] = 1;
        that.loadComplete();
    };
    img.src = url;
    // account for 1 indexing
    this.images[index-1] = img;
}

SyncLoop.prototype.loadSong = function(url) {
    var that = this;
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.responseType = 'arraybuffer';
    req.onload = function() {
        that.audio = req.response;
        that.loadProgress[0] = 1;
        that.loadComplete();
    };
    req.onerror = function() {
        console.log("Could not load loop audio at URL", url);
    }
    req.onprogress = function(event) {
        if (event.lengthComputable) {
            var percent = event.loaded / event.total;
            that.loadProgress[0] = percent;
            that.updateProgress();
        } else {
            // Unable to compute progress information since the total size is unknown
        }
    }
    req.send();
}

SyncLoop.prototype.updateProgress = function() {
    var sum = this.loadProgress.reduce(function(a, b){return a+b;});
    var percent = sum / this.loadProgress.length;
    var prog = document.getElementById("preMain");
    var scale = Math.floor(percent * 100);
    prog.textContent = scale + "%";
}

SyncLoop.prototype.animationLoop = function() {
    var that = this;
    requestAnimationFrame(function() {that.animationLoop()});
    if(!this.soundManager.playing) {
        return;
    }
    
    var songBeat = this.getSongBeat();
    var frame = this.getAnimFrame(songBeat);
    var imgFrame = this.frames[frame];
    
    if(imgFrame != this.lastFrame) {
        this.lastFrame = imgFrame;
        // Clear
        this.canvas.canvas.width = this.canvas.canvas.width;
        this.canvas.drawImage(this.images[imgFrame], 0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
    }
}

SyncLoop.prototype.getSongBeat = function() {
    var songBeats = this.defaults.song.beatsPerLoop || this.defaults.song.beatmap.length;
    var songBeat = songBeats * this.soundManager.currentProgress();
    var beatmap = this.defaults.song.beatmap;
    if(beatmap) {
        while(this.lastBeat < songBeat) {
            if(beatmap[Math.floor(this.lastBeat++ % songBeats)] == ".") {
                this.beatOffset++;
            }
        }
        if(beatmap[Math.floor(this.lastBeat % songBeats)] == ".") {
            songBeat = Math.floor(songBeat);
        }
    }
    return songBeat - this.beatOffset; 
}

SyncLoop.prototype.getAnimFrame = function(songBeat) {
    var frame = 0;
    var animBeats = this.defaults.animation.beatsPerLoop || this.animTiming.length;
    if(this.animTiming.length) { // custom beat endpoints
        songBeat %= animBeats;
        var beatFrames = this.animTiming[Math.floor(songBeat)];
        frame = beatFrames[Math.floor(beatFrames.length * (songBeat % 1))];
    } else {
        var animProgress = (this.frames.length / animBeats) * songBeat;
        frame = Math.floor(animProgress);
    }
    
    if(this.defaults.animation.syncOffset) {
        frame += this.defaults.animation.syncOffset;
    }
    
    frame = this.mod(frame, this.frames.length);
    
    return frame;
}

SyncLoop.prototype.mod = function(num, n) {
    return ((num%n)+n)%n;
}

SyncLoop.prototype.resize = function() {
    if(this.toLoad > 0) {
        return;
    }
    var elem = this.canvas.canvas;
    
    // Set unscaled
    var width = this.images[0].width;
    var height = this.images[0].height;
    var ratio = width / height;
    
    var scaleWidth = window.innerHeight * ratio;
    if(scaleWidth > window.innerWidth) {
        elem.height = Math.floor(window.innerWidth / ratio);
        elem.width = Math.floor(window.innerWidth);
    } else {
        elem.height = Math.floor(window.innerHeight);
        elem.width = Math.floor(scaleWidth);
    }
    elem.style.height = elem.height + "px";
    elem.style.width = elem.width + "px";
    
    elem.style.marginLeft = (window.innerWidth - elem.width) / 2 + "px";
    elem.style.marginTop = (window.innerHeight - elem.height) / 2 + "px";
}

SyncLoop.prototype.keyHandler = function(key) {
    switch (key) {
    case 109: // NUMPAD_SUBTRACT
    case 189: // MINUS
    case 173: // MINUS, legacy
        this.soundManager.decreaseVolume();
        break;
    case 107: // NUMPAD_ADD
    case 187: // EQUAL
    case 61: // EQUAL, legacy
        this.soundManager.increaseVolume();
        break;
    case 77: // M
        this.soundManager.toggleMute();
        break;
    default:
        return true;
    }
    return false;
}

SyncLoop.prototype.error = function(message) {
    document.getElementById("preSub").textContent = "Error: " + message;
    document.getElementById("preMain").style.color = "#F00";
}