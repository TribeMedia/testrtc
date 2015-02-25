#!/usr/bin/python
#
# Copyright 2014 Google Inc. All Rights Reserved.

"""WebRTC

This module serves the WebRTC troubleshooter page.
"""
import cgi
import logging
import random
import os
import jinja2
import webapp2
import urllib
import datetime

from google.appengine.ext import blobstore
from google.appengine.ext.webapp import blobstore_handlers

jinja_environment = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)))

# Generate 10 kilobytes of random data and create a 10MB buffer from it.
random_file = bytearray([random.randint(0,127) for i in xrange(0,10000)] * 1000)

class MainPage(webapp2.RequestHandler):
  """The main UI page, renders the 'index.html' template."""
  def get(self):
    template = jinja_environment.get_template('src/index.html')
    content = template.render({})
    self.response.out.write(content)

class UploadHandler(blobstore_handlers.BlobstoreUploadHandler):
  # Generate and return blobstore upload URL.
  def head(self):
    upload_url = blobstore.create_upload_url('/upload')
    self.response.headers['Response-Text'] = upload_url
  # Upload file to the blobstore.
  def post(self):
    name = self.request.headers['X-File-Name']
    upload_files = self.get_uploads(field_name=name)
    blob_info = upload_files[0]
    host = self.request.headers['Referer']
    self.response.headers['Response-Text'] = host + 'serve/%s' % blob_info.key()

class ServeHandler(blobstore_handlers.BlobstoreDownloadHandler):
  def get(self, resource):
    resource = str(urllib.unquote(resource))
    blob_info = blobstore.BlobInfo.get(resource)
    self.send_blob(blob_info)

class TestDownloadFile(webapp2.RequestHandler):
  def get(self, size_kbytes):
    self.response.headers.add_header("Access-Control-Allow-Origin", "*")
    self.response.headers['Content-Type'] = 'application/octet-stream'
    self.response.out.write(random_file[0: int(size_kbytes)*1000])

class CleanBlobstore(blobstore_handlers.BlobstoreUploadHandler):
  def get(self):
    retentionPeriod = datetime.datetime.now() - datetime.timedelta(days=30)
    gqlQuery = blobstore.BlobInfo.gql("WHERE creation <= :date",
        date = datetime.datetime.now() <= retentionPeriod)
    # Only guaranteed up to 1000 results at a time.
    logFiles = gqlQuery.fetch(1000)
    if len(logFiles)!= 0:
      for log in logFiles:
        blobstore.BlobInfo.get(log.key()).delete()
      self.get()
    else:
      return

app = webapp2.WSGIApplication([
    ('/', MainPage),
    ('/upload', UploadHandler),
    ('/serve/([^/]+)?', ServeHandler),
    (r'/test-download-file/(\d?\d00)KB.data', TestDownloadFile),
    ('/tasks/blobstore/clean', CleanBlobstore)
  ], debug=True)
