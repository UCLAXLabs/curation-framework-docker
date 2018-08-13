import json
import os
import uuid
import requests

def _get_curation_json():

    #curation_json = '''
    #    {{
    #'''
    with open('curation_1.json') as curationFile:
      c_json = json.load(curationFile)
      curation_json = json.dumps(c_json)
      print(str(curation_json))

    return curation_json

def _upload_JSON_LD():
    #init_id = str(uuid.uuid4())
    #curation_json = _get_curation_json(init_id)
    curation_json = _get_curation_json()

    # # JSON
    #resp = self.tc.post('/{}'.format(self.app.cfg.api_path()),
    #                    headers={'Accept': 'application/json',
    #                             'Content-Type': 'application/json',
    #                             'X-Access-Token': 'foo',
    #                            },
    #                    data=curation_json)
    url = "http://164.67.152.202/cp/curation/api"
    #resp = requests.post(url, headers={'Accept': 'application/json',
    #                                   'Content-Type': 'application/json',
    #                                   'X-Access-Token': 'foo',
    #                                   },
    #                     data=curation_json)
    #print("response code",resp.status_code)
    ##self.assertEqual(resp.status, '201 CREATED')
    #json_obj = resp.json()
    #print("response type",json_obj['@type'])
    #print("response id",json_obj['@id'])

    # PMB Only want to insert new activity strea; I think this does it
    # # JSON-LD
    #resp = self.tc.post('/{}'.format(self.app.cfg.api_path()),
    #                    headers={'Accept': 'application/json',
    #                             'Content-Type': 'application/ld+json',
    #                             'X-Access-Token': 'foo',
    #                             },
    #                    data=curation_json)
    resp = requests.post(url, headers={'Accept': 'application/json',
                                       'Content-Type': 'application/ld+json',
                                       'X-Access-Token': 'foo',
                                      },
                        data=curation_json)
    print("response code",resp.status_code)
    #self.assertEqual(resp.status, '201 CREATED')
    location = resp.headers.get('Location')
    print("location",location)
    json_obj = resp.json()
    print(str(json_obj))
    #print("response type",json_obj['@type'])
    #print("response id",json_obj['@id'])
    # location = resp.headers.get('Location')
    # self.assertEqual(json_obj['@id'], location)
    # for some reason location doesn't include a port for the unit test
    # BUT it works when JSONkeeper is normally run

# MAIN
_upload_JSON_LD()
