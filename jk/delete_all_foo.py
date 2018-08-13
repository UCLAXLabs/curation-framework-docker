import json
import os
import uuid
import requests

def test_userdocs():
    """ Test the /<api_path>/userdocs endpoint.
    """

    url = "http://164.67.152.202/cp/curation/api/"
    resp = requests.get(url + "userdocs",
                        headers={'Accept': 'application/json',
                                 'X-Access-Token': 'foo'})
    docs = resp.json()
    # Next step: delete them!
    for d in docs:
        ID = d['id']
        print("attempting to delete id",str(ID))
        resp = requests.delete(url + str(ID),
                               headers={'X-Access-Token': 'foo'})
        print("status code",resp.status_code)


# MAIN
test_userdocs()
