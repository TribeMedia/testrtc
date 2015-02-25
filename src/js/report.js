/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* exported report */
'use strict';

function Report() {
  this.output_ = ['TestRTC-Diagnose v0.1'];
  this.nextAsyncId_ = 0;

  // Hook console.log into the report, since that is the most common debug tool.
  this.nativeLog_ = console.log.bind(console);
  console.log = this.logHook_.bind(this);

  // Hook up window.onerror logs into the report.
  window.addEventListener('error', this.onWindowError_.bind(this));

  this.traceEventInstant('system-info', Report.getSystemInfo());
}

Report.prototype = {
  open: function() {
    document.getElementById('report-dialog').open();
  },

  prepareReport: function(parentElement) {
    // Opened paper-dialogs are in shadow root hence the element reference needs
    // to be provided.
    this.downloadUrlElement = parentElement.querySelector('#download-url');
    this.uploadButton = parentElement.querySelector('#upload-button');

    // Make sure the download link is cleared and the upload button is enabled
    // on close. Need to find the elements in the document root because when the
    // paper-dialog is closed it's no longer in shadow-root.
    parentElement.addEventListener('core-overlay-close-completed', function() {
      document.getElementById('upload-button').disabled = false;
      document.getElementById('download-url').innerHTML = '';
    }, false);

    // Create file.
    this.fileName = 'testrtc-' + new Date().toJSON() + '.log';
    var fileContent = this.getContent_();
    var blob = new Blob([fileContent], {type: 'text/plain'});
    this.formData = new FormData();
    this.formData.append(this.fileName, blob, this.fileName);

    this.getBlobUrl_();
  },

   // Get the upload url from blobstore.
  getBlobUrl_: function() {
    var xhr = new XMLHttpRequest();
    xhr.open('HEAD', '/upload', true);

    xhr.addEventListener('load', function(response) {
      if (response.currentTarget.status === 200) {
        this.fileUpload_(xhr.getResponseHeader('response-text'));
      } else {
        this.downloadUrlElement.innerHTML = 'Fetching URL failed with error: ' +
            response.currentTarget.status + '.';
        this.traceEventInstant('log', this.downloadUrlElement.innerHTML);
      }
    }.bind(this), false);

    xhr.send(null);
  },

  // Upload the file using the blobstore url as an argument.
  fileUpload_: function(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('X-File-Name', this.fileName);

    xhr.addEventListener('load', function(response) {
      if (response.currentTarget.status === 200) {
        this.downloadUrlElement.innerHTML = 'Link to log file: ' + '<a href=' +
            xhr.getResponseHeader('response-text') + '> ' +
            xhr.getResponseHeader('response-text') + '</a>';
        this.uploadButton.disabled = true;
        this.linkToChromiumBug_(xhr.getResponseHeader('response-text'));
      } else {
        this.downloadUrlElement.innerHTML = 'Upload failed with error: ' +
            response.currentTarget.status + '.';
        this.traceEventInstant('log', this.downloadUrlElement.innerHTML);
      }
    }.bind(this), false);

    xhr.send(this.formData);
  },

  traceEventInstant: function(name, args) {
    this.output_.push({'ts': Date.now(),
                       'name': name,
                       'args': args});
  },

  traceEventWithId: function(name, id, args) {
    this.output_.push({'ts': Date.now(),
                       'name': name,
                       'id': id,
                       'args': args});
  },

  traceEventAsync: function(name) {
    return this.traceEventWithId.bind(this, name, this.nextAsyncId_++);
  },

  logTestRunResult: function(testName, status) {
    // Google Analytics event for the test result to allow to track how the
    // test is doing in the wild.
    ga('send', {
       'hitType': 'event',
       'eventCategory': 'Test',
       'eventAction': status,
       'eventLabel': testName,
       'nonInteraction': 1
    });
  },

  linkToChromiumBug_: function(logUrl) {
    var info = Report.getSystemInfo();

    var description = 'Browser: ' + info.browserName + ' ' +
        info.browserVersion + ' (' + info.platform + ')\n\n' +
        'Log file link from http://test.webrtc.org:\n' + logUrl;

    // Labels for the bug to be filed.
    var osLabel = 'OS-';
    if (info.platform.indexOf('Win') !== -1) { osLabel += 'Windows'; }
    if (info.platform.indexOf('Mac') !== -1) { osLabel += 'Mac'; }
    if (info.platform.match('iPhone|iPad|iPod|iOS')) { osLabel += 'iOS'; }
    if (info.platform.indexOf('Linux') !== -1) { osLabel += 'Linux'; }
    if (info.platform.indexOf('Android') !== -1) { osLabel += 'Android'; }

    var labels = 'webrtc-troubleshooter,Cr-Blink-WebRTC,' + osLabel;
    var url = 'https://code.google.com/p/chromium/issues/entry?' +
        'comment=' + encodeURIComponent(description) +
        '&labels=' + encodeURIComponent(labels);
    window.open(url, '_blank');
  },

  // Returns the logs into a JSON formated string that is a list of events
  // similar to the way chrome devtools format uses. The final string is
  // manually composed to have newlines between the entries is being easier
  // to parse by human eyes.
  getContent_: function() {
    var stringArray = [];
    for (var i = 0; i !== this.output_.length; ++i) {
      stringArray.push(JSON.stringify(this.output_[i]));
    }
    return '[' + stringArray.join(',\n') + ']';
  },

  onWindowError_: function(error) {
    this.traceEventInstant('error', {'message': error.message,
                                     'filename': error.filename + ':' +
                                     error.lineno});
  },

  logHook_: function() {
    this.traceEventInstant('log', arguments);
    this.nativeLog_.apply(null, arguments);
  }
};

/*
 * Detects the running browser name, version and platform.
 */
Report.getSystemInfo = function() {
  // Code inspired by http://goo.gl/9dZZqE with
  // added support of modern Internet Explorer versions (Trident).
  var agent = navigator.userAgent;
  var browserName = navigator.appName;
  var version = '' + parseFloat(navigator.appVersion);
  var offsetName;
  var offsetVersion;
  var ix;

  if ((offsetVersion = agent.indexOf('Chrome')) !== -1) {
    browserName = 'Chrome';
    version = agent.substring(offsetVersion + 7);
  } else if ((offsetVersion = agent.indexOf('MSIE')) !== -1) {
    browserName = 'Microsoft Internet Explorer'; // Older IE versions.
    version = agent.substring(offsetVersion + 5);
  } else if ((offsetVersion = agent.indexOf('Trident')) !== -1) {
    browserName = 'Microsoft Internet Explorer'; // Newer IE versions.
    version = agent.substring(offsetVersion + 8);
  } else if ((offsetVersion = agent.indexOf('Firefox')) !== -1) {
    browserName = 'Firefox';
  } else if ((offsetVersion = agent.indexOf('Safari')) !== -1) {
    browserName = 'Safari';
    version = agent.substring(offsetVersion + 7);
    if ((offsetVersion = agent.indexOf('Version')) !== -1) {
      version = agent.substring(offsetVersion + 8);
    }
  } else if ((offsetName = agent.lastIndexOf(' ') + 1) <
              (offsetVersion = agent.lastIndexOf('/'))) {
    // For other browsers 'name/version' is at the end of userAgent
    browserName = agent.substring(offsetName, offsetVersion);
    version = agent.substring(offsetVersion + 1);
    if (browserName.toLowerCase() === browserName.toUpperCase()) {
      browserName = navigator.appName;
    }
  } // Trim the version string at semicolon/space if present.
  if ((ix = version.indexOf(';')) !== -1) {
    version = version.substring(0, ix);
  }
  if ((ix = version.indexOf(' ')) !== -1) {
    version = version.substring(0, ix);
  }
  return {'browserName': browserName,
          'browserVersion': version,
          'platform': navigator.platform};
};

var report = new Report();
