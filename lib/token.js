"use strict"

var DEBUG_STAND_ALONE_NOT_BIND=true;

//Token流水
var addTokenFlow=function(org,amount,isAdd,balanceChangeReason){
    var factory=getFactory();

    var now=new Date();
    var assetID="TF"+now.getTime().toString()+Math.floor(Math.random()*100+100);
    var assetResource=factory.newResource("sharedAssets","TokenFlow",assetID);
    assetResource.partyID=org.getIdentifier();
    assetResource.involvedCreditorOrg=org;
    assetResource.amount=amount;
    assetResource.isAdd=isAdd;
    assetResource.balanceChangeReason=balanceChangeReason;
    assetResource.time=now;
    assetResource.balance=org.balance;

    return getAssetRegistry("sharedAssets.TokenFlow")
        .then(function(assetRegistry){
            assetRegistry.add(assetResource);
        });
}

/**
 * 机构充值
 * @param {sharedAssets.tokenRecharge} tokenRechargeTX
 * @transaction
 */
function onTokenRecharge(tokenRechargeTX){
    var currentParticipant=getCurrentParticipant();
    var factory=getFactory();
    
    var targetParticipant;
    if(DEBUG_STAND_ALONE_NOT_BIND){
        targetParticipant=tokenRechargeTX.involvedCreditorOrg;
    }else if(!currentParticipant){
        targetParticipant=currentParticipant;
    }else{
        throw new Error("transaction needs a participant");
    }

    targetParticipant.balance += tokenRechargeTX.amount;
    targetParticipant.contributionValue += tokenRechargeTX.amount;

    return getParticipantRegistry("sharedAssets.InvolvedCreditorOrg")
        .then(function(orgRegistry){
            orgRegistry.update(targetParticipant);
        })
        .then(function(){
            var eventResource=factory.newEvent("sharedAssets","TokenRechargeEvent");
            eventResource.involvedCreditorOrg=targetParticipant;
            eventResource.amount=tokenRechargeTX.amount;
            emit(eventResource);
        })
        .then(function(){
            return addTokenFlow(targetParticipant,tokenRechargeTX.amount,true,"RECHARGE");
        })

}

/**
 * 机构提现
 * @param {sharedAssets.tokenWithdraw} tokenWithdrawTX
 * @transaction
 */
function onTokenWithdraw(tokenWithdrawTX){
    var currentParticipant=getCurrentParticipant();
    var factory=getFactory();
    
    var targetParticipant;
    if(DEBUG_STAND_ALONE_NOT_BIND){
        targetParticipant=tokenWithdrawTX.involvedCreditorOrg;
    }else if(!currentParticipant){
        targetParticipant=currentParticipant;
    }else{
        throw new Error("transaction needs a participant");
    }

    targetParticipant.balance -= tokenWithdrawTX.amount;
    targetParticipant.contributionValue -= tokenWithdrawTX.amount;

    if(targetParticipant.balance<0){
        throw new Error("Not enough balance");
    }

    return getParticipantRegistry("sharedAssets.InvolvedCreditorOrg")
        .then(function(orgRegistry){
            orgRegistry.update(targetParticipant);
        })
        .then(function(){
            var eventResource=factory.newEvent("sharedAssets","TokenWithdrawEvent");
            eventResource.involvedCreditorOrg=targetParticipant;
            eventResource.amount=tokenWithdrawTX.amount;
            emit(eventResource);
        })
        .then(function(){
            return addTokenFlow(targetParticipant,tokenWithdrawTX.amount,false,"WITHDRAW");
        })

}