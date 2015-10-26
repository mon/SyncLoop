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
    this.imageSequence = true;
    
    this.video = null;
    this.playbackRate = 1;
    this.canvas = document.getElementById(defaults.canvasID).getContext("2d");
    this.lastFrame = -1;
    
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
    console.log("SoundManager ready...");
    
    if(!this.defaults.animation.filename) {
        var test = document.createElement("video");
        if(!test.playbackRate) {
            this.error("Video playback rate not alterable :(");
            return;
        }
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
    var that = this;
    // todo probably a better way than a ternary
    this.imageSequence = this.defaults.animation.filename ? true : false;
    if(this.imageSequence) {
        // anim frames + song file
        this.toLoad = this.defaults.animation.frames + 1;
    } else {
        this.toLoad = 2;
    }
    
    this.loadProgress = [];
    for(var i = 0; i < this.toLoad; i++) {
        this.loadProgress[i] = 0;
    }
    
    this.loadSong(this.defaults.song.filename);
    
    if(this.imageSequence) {
        // NOTE: 1 indexed
        for(var i = 1; i <= this.defaults.animation.frames; i++) {
            this.loadImage(this.defaults.animation.filename.replace("%FRAME%", i), i);
        }
    } else { // video
        this.video = document.createElement('video');
        var source = document.createElement('source');    
        source.src = this.defaults.animation.video;
        source.type = "video/webm";
        this.video.appendChild(source);
        /*var handler = function() {
            var video = that.video;
            if( video.duration ) {
                var percent = 0;
                if(video.buffered.length > 0) {
                    var percent = (video.buffered.end(0)/video.duration);
                }
                if( percent >= 1.0 ) {
                    console.log("Video load complete");
                    that.loadProgress[1] = 1;
                    that.video.removeEventListener("progress", handler);
                    that.loadComplete();
                    return;
                }
                that.loadProgress[1] = percent;
                video.currentTime++;    
            }   
        }*/
        this.video.addEventListener("videoEnd", function() {
            that.video.loop = true;
            that.video.play();
        });
        that.loadProgress[1] = 1; //debug shit
        this.video.addEventListener('loadeddata', function() {
           that.loadComplete();
        }, false);
        this.video.loop = true;
        this.video.controls = true;
        //this.video.addEventListener("progress", handler,false);
        
        document.body.appendChild(this.video);
    }
}

SyncLoop.prototype.loadComplete = function() {
    var that = this;
    this.updateProgress();
    document.getElementById("preloadHelper").className = "loaded";
    window.setTimeout(function() {
        document.getElementById("preloadHelper").style.display = "none";
    }, 1500);
    if(--this.toLoad <= 0) {
        this.resize();
        this.soundManager.playSong(this.audio, function() {
            if(!that.imageSequence) {
                that.canvas.canvas.style.display = "none";
                var vidlen = that.video.duration;
                console.log("Video length", vidlen);
                var audlen = that.soundManager.buffer.duration;
                console.log("Audio length", audlen);
                var loops = that.defaults.song.beatsPerLoop / that.defaults.animation.beatsPerLoop;
                that.playbackRate = (loops * vidlen) / audlen;
                that.video.playbackRate = this.playbackRate;
                that.video.play();
            }
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
    var now = this.soundManager.currentTime();
    
    var songBeats = this.defaults.song.beatsPerLoop;
    var animBeats = this.defaults.animation.beatsPerLoop;
    var songBeat = songBeats * this.soundManager.currentProgress();
    if(this.imageSequence) {
        var animProgress = (this.images.length / animBeats) * songBeat;
        var frame = Math.floor(animProgress);
        if(this.defaults.animation.syncOffset) {
            frame += this.defaults.animation.syncOffset;
        }
        frame %= this.images.length
        if(frame != this.lastFrame) {
            this.lastFrame = frame;
            // Clear
            this.canvas.canvas.width = this.canvas.canvas.width;
            this.canvas.drawImage(this.images[frame], 0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
        }
    } else {
        this.videoSync = 0;
        var animProgress = (this.video.duration / animBeats) * songBeat;
        if(this.defaults.animation.syncOffset) {
            animProgress += this.defaults.animation.syncOffset;
        }
        var shouldBe = (animProgress % this.video.duration);
        var error = this.video.currentTime - shouldBe;
        if(error < -this.video.duration/2) error += this.video.duration;
        if(error > this.video.duration/2) error -= this.video.duration;
        error /= this.video.duration; // percentage
        var rate = this.playbackRate * (1 - error*5);
        this.video.playbackRate = Math.max(0, rate);
    }
}

SyncLoop.prototype.resize = function() {
    if(this.toLoad > 0) {
        return;
    }
    
    var elem = null;
    var width = 0;
    var height = 0;
    // Set unscaled
    if(this.imageSequence) {
        elem = this.canvas.canvas;
        width = this.images[0].width;
        height = this.images[0].height;
    } else {
        elem = this.video;
        width = elem.videoWidth;
        height = elem.videoHeight;
    }
    console.log("Resizing: width", width, "height", height);
    // Video not loaded yet?
    if(width == 0 || height == 0) {
        elem.style.height = "100%";
        elem.style.width = "100%";
        elem.style.marginLeft = 0;
        elem.style.marginTop = 0;
        return;
    }
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