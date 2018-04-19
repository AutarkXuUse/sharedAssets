#!/bin/bash
composer archive create -t dir -n .&&composer network upgrade -n shared-assets-composer --networkVersion 0.0.2 -c admin@shared-assets-composer && composer-rest-server -c admin@shared-assets-composer -n always -w true
