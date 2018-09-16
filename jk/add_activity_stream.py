import json
import os
import requests

# Simple utility to upload an activity stream manually to the
# JSONKeeper service, where it will be stored until it can
# be indexed by the CanvasIndexer service and then finally
# made available to the IIIF Curation Finder and other 
# front-end interfaces.

# URL of the JSONKeeper service
keeperURL = "http://127.0.0.1:5000/api"
pathToAS = 'tf_curation.json'

def _get_curation_json():
    with open(pathToAS) as curationFile:
      c_json = json.load(curationFile)
      curation_json = json.dumps(c_json)

    return curation_json

def _upload_JSON_LD():
    curation_json = _get_curation_json()

    url = keeperURL
    resp = requests.post(url, headers={'Accept': 'application/json',
                                       'Content-Type': 'application/ld+json',
                                       'X-Access-Token': 'foo',
                                      },
                        data=curation_json)
    print("response code",resp.status_code)
    location = resp.headers.get('Location')
    print("location",location)
    json_obj = resp.json()
    print(str(json_obj))

# MAIN
_upload_JSON_LD()
