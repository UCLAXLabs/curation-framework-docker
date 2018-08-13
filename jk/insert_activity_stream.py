import json
import os
import uuid
import requests

def _get_curation_json(init_id):
    can_id = ('http://iiif.bodleian.ox.ac.uk/iiif/canvas/03818fac-9ba6-438'
              '2-b339-e27a0a075f31.json#xywh=986,4209,538,880')
    man_id = ('http://iiif.bodleian.ox.ac.uk/iiif/manifest/60834383-7146-4'
              '1ab-bfe1-48ee97bc04be.json')
    curation_json = '''
        {{
          "@context":[
            "http://iiif.io/api/presentation/2/context.json",
            "http://codh.rois.ac.jp/iiif/curation/1/context.json"
            ],
          "@id":"{}",
          "@type":"cr:Curation",
          "selections":[
              {{
                "@id":"{}",
                "@type":"sc:Range",
                "label":"",
                "canvases": [
                                {{
                                    "@id":"{}",
                                    "label":"Marine exploration"
                                }}
                            ],
                "within": [
                            {{
                            "@id": "{}",
                            "@type": "sc:Manifest",
                            "label": "MS. Bodl. 264"
                            }}
                          ]
              }}
            ]
        }}'''.format(init_id, init_id, can_id, man_id)
    return curation_json

def _upload_JSON_LD():
    init_id = str(uuid.uuid4())
    curation_json = _get_curation_json(init_id)
    print(curation_json)
    quit()

    # # JSON
    #resp = self.tc.post('/{}'.format(self.app.cfg.api_path()),
    #                    headers={'Accept': 'application/json',
    #                             'Content-Type': 'application/json',
    #                             'X-Access-Token': 'foo',
    #                            },
    #                    data=curation_json)
    url = "http://164.67.152.202/cp/curation/api"
    resp = requests.post(url, headers={'Accept': 'application/json',
                                       'Content-Type': 'application/json',
                                       'X-Access-Token': 'foo',
                                       },
                         data=curation_json)
    print("response code",resp.status_code)
    #self.assertEqual(resp.status, '201 CREATED')
    json_obj = resp.json()
    print("response type",json_obj['@type'])
    print("response id",json_obj['@id'])

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
    json_obj = resp.json()
    print("response type",json_obj['@type'])
    print("response id",json_obj['@id'])
    # location = resp.headers.get('Location')
    # self.assertEqual(json_obj['@id'], location)
    # for some reason location doesn't include a port for the unit test
    # BUT it works when JSONkeeper is normally run
    location = resp.headers.get('Location')
    print("location",location)

# MAIN
_upload_JSON_LD()
