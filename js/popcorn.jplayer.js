/*
 * jPlayer Player Plugin for Popcorn JavaScript Library
 * http://www.jplayer.org
 *
 * Copyright (c) 2012 Happyworm Ltd
 * Dual licensed under the MIT and GPL licenses.
 *  - http://www.opensource.org/licenses/mit-license.php
 *  - http://www.gnu.org/copyleft/gpl.html
 *
 * Author: Mark J Panaghiston
 * Version: 0.1.0
 * Date: 19th June 2012
 *
 * For jPlayer Version: 2.1.0
 * Requires: jQuery 1.3.2+
 * Note: jQuery dependancy cannot be removed since jPlayer 2 is a jQuery plugin. Use of jQuery will be kept to a minimum.
 */

/* Code verified using http://www.jshint.com/ */
/*jshint asi:false, bitwise:false, boss:false, browser:true, curly:false, debug:false, devel:true, eqeqeq:true, eqnull:false, evil:false, forin:false, immed:false, jquery:true, laxbreak:false, newcap:false, noarg:true, noempty:false, nonew:true, onevar:false, passfail:false, plusplus:false, regexp:false, undef:true, sub:false, strict:false, white:false smarttabs:true */
/*global Popcorn:false */

(function(Popcorn) {

  var jQueryDownloading = false,
  jPlayerDownloading = false;

  Popcorn.player( 'jplayer', {
    _canPlayType: function( containerType, url ) {
      // We should check that the url is absolute too. ie., starts with http:// or https://
      var cType = containerType.toLowerCase();
      if(cType !== 'video' && cType !== 'audio') {
        // Only check the Essential jPlayer Media Formats.
        // Also check it starts with http, so the URL is absolute... Well, it ain't a perfect check.
        if(/(^http.*\.(mp3|mp4|m4a|m4v)$)/i.test(url)) {
          return true;
        } else {
          return false;
        }
      } else {
        return false;
      }
    },
    _setup: function( options ) {

      var media = this,
      myPlayer, // The jQuery selector of the jPlayer element. Usually a <div>
      jPlayerObj, // The jPlayer data instance. For performance and DRY code.
      formatType = 'unknown',
      jpMedia = {},
      ready = false, // Used during init to override the annoying duration dependance in the track event padding during Popcorn's isReady(). ie., We is ready after loadeddata and duration can then be set real value at leisure.
      duration = 0, // For the durationchange event with both HTML5 and Flash solutions. Used with 'ready' to keep control during the Popcorn isReady() via loadeddata event. (Duration=0 is bad.)
      durationchangeId = null, // A timeout ID used with delayed durationchange event. (Because of the duration=NaN fudge to avoid Popcorn track event corruption.)
      canplaythrough = false,
      error = null, // The MediaError object.

      dispatchDurationChange = function() {
        if(ready) {
          //console.log('Dispatched event : durationchange : ' + duration);
          // jPlayerObj._trigger($.jPlayer.event.durationchange); // Loops to oblivion!
          media.dispatchEvent('durationchange');
        } else {
          //console.log('DELAYED EVENT (!ready) : durationchange : ' + duration);
          clearTimeout(durationchangeId); // Stop multiple triggers causing multiple timeouts running in parallel.
          durationchangeId = setTimeout(dispatchDurationChange, 250);
        }
      },

      jPlayerFlashEventsPatch = function() {

        /* Events already supported by jPlayer Flash:
         * loadstart
         * loadedmetadata (M4A, M4V)
         * progress
         * play
         * pause
         * seeking
         * seeked
         * timeupdate
         * ended
         * volumechange
         * error <- See the custom handler in jPlayerInit()
         */

        /* Events patched:
         * loadeddata
         * durationchange
         * canplaythrough
         * playing
         */

        /* Events NOT patched:
         * suspend
         * abort
         * emptied
         * stalled
         * loadedmetadata (MP3)
         * waiting
         * canplay
         * ratechange
         */

        // Triggering patched events through the jPlayer Object so the events are homogeneous. ie., The contain the event.jPlayer data structure.

        var checkDuration = function(event) {
          if(event.jPlayer.status.duration !== duration) {
            duration = event.jPlayer.status.duration;
            dispatchDurationChange();
          }
        },

        checkCanPlayThrough = function(event) {
          if(!canplaythrough && event.jPlayer.status.seekPercent === 100) {
            canplaythrough = true;
            setTimeout(function() {
              //console.log('Trigger : canplaythrough');
              jPlayerObj._trigger($.jPlayer.event.canplaythrough);
            }, 0);
          }
        };

        myPlayer.bind($.jPlayer.event.loadstart, function(event) {
          setTimeout(function() {
            //console.log('Trigger : loadeddata');
            jPlayerObj._trigger($.jPlayer.event.loadeddata);
          }, 0);
        })
        .bind($.jPlayer.event.progress, function(event) {
          checkDuration(event);
          checkCanPlayThrough(event);
        })
        .bind($.jPlayer.event.timeupdate, function(event) {
          checkDuration(event);
          checkCanPlayThrough(event);
        })
        .bind($.jPlayer.event.play, function(event) {
          setTimeout(function() {
            //console.log('Trigger : playing');
            jPlayerObj._trigger($.jPlayer.event.playing);
          }, 0);
        });

        //console.log('Created CUSTOM event handlers for FLASH');
      },

      jPlayerInit = function() {
        (function($) {
          options = options || {};

          myPlayer = $('#' +  media.id);

          if(/\.mp3$/i.test(media.src)) {
            formatType = 'mp3';
          } else if(/\.mp4$/i.test(media.src) || /\.m4v$/i.test(media.src)) {
            formatType = 'm4v';
          } else if(/\.m4a$/i.test(media.src)) {
            formatType = 'm4a';
          } else {
            // We have a problem... Due to only having a URL to work with here.
            // See if a jPlayer supplied option was given to define the SINGLE format.
            var supplied = (options.supplied && options.supplied.split(',')) || [];
            if(/\.(m4v|m4a|mp3)$/i.test(supplied[0])) {
              formatType = supplied[0];
            } else {
              // Give up.
              error = {
                code: 3 // MEDIA_ERR_DECODE Not quite correct, since the resource was never established to be usable. But close enough.
              };
              //console.log('Dispatched event: error');
              media.dispatchEvent('error');
              return;
            }
          }

          jpMedia[formatType] = media.src;
          jpMedia.poster = options.poster;

          options.supplied = formatType; // Force the supplied option, just in case it was set in the options.

          // options.solution = 'flash,html'; // TMP FOR TESTING!!!

          // Allow the swfPath to be set to local server. ie., If the jPlayer Plugin is local and already on the page, then you can also use the local SWF.
          options.swfPath = options.swfPath || 'http://www.jplayer.org/2.1.0/js/Jplayer.swf';

          myPlayer.bind($.jPlayer.event.ready, function(event) {
            if(event.jPlayer.flash.used) {
              jPlayerFlashEventsPatch();
            }
            // Set the media andd load it, so that the Flash solution behaves similar to HTML5 solution.
            // This also allows the loadstart event to be used to know jPlayer is ready.
            $(this).jPlayer('setMedia', jpMedia).jPlayer('load');
          });

          // Do not auto-bubble the reserved events, nor the loadeddata and durationchange event, since the duration must be carefully handled when loadeddata event occurs.
          // See the duration property code for more details. (Ranting.)

          var reservedEvents = $.jPlayer.reservedEvent + ' loadeddata durationchange',
          reservedEvent = reservedEvents.split(/\s+/g);

          // Generate event handlers for all the standard HTML5 media events. (Except durationchange)

          var bindEvent = function(name) {
            myPlayer.bind($.jPlayer.event[name], function(event) {
              //console.log('Dispatched event: ' + name + (event && event.jPlayer ? ' (' + event.jPlayer.status.currentTime + 's)' : '')); // Must be after dispatch for some reason on Firefox/Opera
              media.dispatchEvent(name);
            });
            //console.log('Created event handler for: ' + name);
          };

          for(var eventName in $.jPlayer.event) {
            if($.jPlayer.event.hasOwnProperty(eventName)) {
              var nativeEvent = true;
              for(var iRes in reservedEvent) {
                if(reservedEvent.hasOwnProperty(iRes)) {
                  if(reservedEvent[iRes] === eventName) {
                    nativeEvent = false;
                    break;
                  }
                }
              }
              if(nativeEvent) {
                bindEvent(eventName);
              } else {
                //console.log('Skipped auto event handler creation for: ' + eventName);
              }
            }
          }

          myPlayer.bind($.jPlayer.event.loadeddata, function(event) {
            //console.log('Dispatched event: loadeddata' + (event && event.jPlayer ? ' (' + event.jPlayer.status.currentTime + 's)' : ''));
            media.dispatchEvent('loadeddata');
            ready = true;
          });
          //console.log('Created CUSTOM event handler for: loadeddata');

          myPlayer.bind($.jPlayer.event.durationchange, function(event) {
            duration = event.jPlayer.status.duration;
            dispatchDurationChange();
          });
          //console.log('Created CUSTOM event handler for: durationchange');

          // The error event is a special case. Plus jPlayer error event assumes it is a broken URL. (It could also be a decoder error... Or aborted or a Network error.)
          myPlayer.bind($.jPlayer.event.error, function(event) {
            // Not sure how to handle the error situation. Popcorn does not appear to have the error or error.code property documented here: http://popcornjs.org/popcorn-docs/media-methods/
            // If any error event happens, then something has gone pear shaped.

            error = event.jPlayer.error; // Saving object pointer, not a copy of the object. Possible garbage collection issue... But the player is dead anyway, so don't care.

            if(error.type === $.jPlayer.error.URL) {
              error.code = 4; // MEDIA_ERR_SRC_NOT_SUPPORTED since jPlayer makes this assumption. It is the most common error, then the decode error. Never seen either of the other 2 error types occur.
            } else {
              error.code = 0; // It was a jPlayer error, not an HTML5 media error.
            }

            //console.log('Dispatched event: error');
            console.dir(error);
            media.dispatchEvent('error');
          });
          //console.log('Created CUSTOM event handler for: error');

          Popcorn.player.defineProperty( media, 'error', {
            set: function( val ) {
              // Read-only property
              if(!options.destroyed) {
                return error;
              }
            },
            get: function() {
              if(!options.destroyed) {
                return error;
              }
            }
          });

          Popcorn.player.defineProperty( media, 'currentTime', {
            set: function( val ) {
              if(!options.destroyed) {
                if(jPlayerObj.status.paused) {
                  myPlayer.jPlayer('pause', val);
                } else {
                  myPlayer.jPlayer('play', val);
                }
                // Only do this for the flash after testing it solves prob
                // //console.log('Trigger : seeked');
                // myPlayer.trigger($.jPlayer.event.seeked);
                // //console.log('(set) typeof currentTime: ' + typeof val);
                return val;
              }
            },
            get: function() {
              if(!options.destroyed) {
                // //console.log('(get) typeof currentTime: ' + typeof myPlayer.data('jPlayer').status.currentTime);
                return jPlayerObj.status.currentTime;
              }
            }
          });

          /* The joy of duration and the loadeddata event isReady() handler
           * The duration is assumed to be a NaN or a valid duration.
           * jPlayer uses zero instead of a NaN and this screws up the Popcorn track event start/end arrays padding.
           * This line here:
           *  videoDurationPlus = duration != duration ? Number.MAX_VALUE : duration + 1;
           * Not sure why it is not simply:
           *  videoDurationPlus = Number.MAX_VALUE; // Who cares if the padding is close to the real duration?
           * So if you trigger loadeddata before the duration is correct, the track event padding is screwed up. (It pads the start, not the end... Well, duration+1 = 0+1 = 1s)
           * That line makes the MP3 Flash fallback difficult to setup. The whole MP3 will need to load before the duration is known.
           * Planning on using a NaN for duration until a >0 value is found... Except with MP3, where seekPercent must be 100% before setting the duration.
           * Why not just use a NaN during init... And then correct the duration later?
           */

          Popcorn.player.defineProperty( media, 'duration', {
            set: function( val ) {
              // Read-only property
              if(!options.destroyed && ready) {
                return duration;
              } else {
                return NaN;
              }
            },
            get: function() {
              if(!options.destroyed && ready) {
                return duration; // Popcorn has initialized, we can now use duration zero or whatever without fear.
              } else {
                return NaN; // Keep the duration a NaN until after loadeddata event has occurred. Otherwise Popcorn track event padding is corrupted.
              }
            }
          });

          Popcorn.player.defineProperty( media, 'muted', {
            set: function( val ) {
              if(!options.destroyed) {
                myPlayer.jPlayer('mute', val);
                return jPlayerObj.options.muted;
              }
            },
            get: function() {
              if(!options.destroyed) {
                return jPlayerObj.options.muted;
              }
            }
          });

          Popcorn.player.defineProperty( media, 'volume', {
            set: function( val ) {
              if(!options.destroyed) {
                myPlayer.jPlayer('volume', val);
                return jPlayerObj.options.volume;
              }
            },
            get: function() {
              if(!options.destroyed) {
                return jPlayerObj.options.volume;
              }
            }
          });

          Popcorn.player.defineProperty( media, 'paused', {
            set: function( val ) {
              // Read-only property
              if(!options.destroyed) {
                return jPlayerObj.status.paused;
              }
            },
            get: function() {
              if(!options.destroyed) {
                return jPlayerObj.status.paused;
              }
            }
          });

          media.play = function() {
            if(!options.destroyed) {
              myPlayer.jPlayer('play');
            }
          };
          media.pause = function() {
            if(!options.destroyed) {
              myPlayer.jPlayer('pause');
            }
          };

          myPlayer.jPlayer(options); // Instance jPlayer. Note that the options should not have a ready event defined... Kill it by default?
          jPlayerObj = myPlayer.data('jPlayer');

        }(jQuery));
      },

      jPlayerCheck = function() {
        if (!jQuery.jPlayer) {
          if (!jPlayerDownloading) {
            jPlayerDownloading = true;
            Popcorn.getScript("http://www.jplayer.org/2.1.0/js/jquery.jplayer.min.js", function() {
              jPlayerDownloading = false;
              jPlayerInit();
            });
          } else {
            setTimeout(jPlayerCheck, 250);
          }
        } else {
          jPlayerInit();
        }
      },

      jQueryCheck = function() {
        if (!window.jQuery) {
          if (!jQueryDownloading) {
            jQueryDownloading = true;
            Popcorn.getScript("http://ajax.googleapis.com/ajax/libs/jquery/1.7/jquery.min.js", function() {
              jQueryDownloading = false;
              jPlayerCheck();
            });
          } else {
            setTimeout(jQueryCheck, 250);
          }
        } else {
          jPlayerCheck();
        }
      };

      jQueryCheck();
    },
    _teardown: function( options ) {
      options.destroyed = true;
      jQuery('#' +  this.id).jPlayer('destroy');
    }
  });

}(Popcorn));