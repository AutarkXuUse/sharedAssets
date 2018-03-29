#!/bin/bash
composer archive create -t dir -n .
composer runtime install --card PeerAdmin@hlfv1 --businessNetworkName shared-assets-composer
composer network start --card PeerAdmin@hlfv1 --networkAdmin admin --networkAdminEnrollSecret adminpw --archiveFile shared-assets-composer@0.0.1.bna --file networkadmin.card&&composer-rest-server -c admin@shared-assets-composer -n always -w true
