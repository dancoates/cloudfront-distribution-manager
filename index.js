#!/usr/bin/env node
const AWS = require('aws-sdk');
const inquirer = require('inquirer');
const ui = new inquirer.ui.BottomBar();
const cloudfront = new AWS.CloudFront({apiVersion: '2016-11-25'});

inquirer.prompt([
    {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: ['Enable', 'Disable', 'Delete']
    },
    {
        type: 'checkbox',
        name: 'distribution',
        message: 'Select the distributions you want to affect',
        choices: () => {
            return new Promise((resolve, reject) => {
                ui.updateBottomBar('Loading distributions...');
                cloudfront.listDistributions({}, (err, data) => {
                    ui.updateBottomBar('');
                    if(err) return reject(err);

                    resolve(data.DistributionList.Items.map(distribution => {
                        return {
                            name: `${distribution.Id} - ${distribution.DomainName} - ${distribution.Origins.Items[0].Id} - ${distribution.Enabled ? 'Enabled' : 'Disabled'}`,
                            short: distribution.Id,
                            value: distribution.Id
                        };
                    }));
                })
            });
        }
    }
]).then(({distribution, action}) => {
    const updates = distribution.map(id => {
        return getDistributionConfig(id)
            .then((distribution) =>
                updateDistribution(id, action === 'Delete' ? 'Disable' : action, distribution)
            ).then((updateResult) => {
                if(action === 'Delete') {
                    return deleteDistribution(id, updateResult);
                } else {
                    return Promise.resolve(updateResult);
                }
            });
    })

    Promise.all(updates)
        .then(results => results.forEach(result => {
            console.log(`Processing finished for distribution ${result.Distribution.Id}`);
        }))
        .catch(err => console.error(err));
});


const getDistributionConfig = (id) => {
    return new Promise((resolve, reject) => {
        console.log(`Fetching config for distribution ${id}`);
        cloudfront.getDistributionConfig({Id : id}, (err, data) => {
            if(err) return reject(err);
            resolve(data);
        });
    });
};


const updateDistribution = (id, action, distribution) => {
    return new Promise((resolve, reject) => {
        console.log(`${action}ing distribution ${id}`);
        const distributionConfig = Object.assign({}, distribution.DistributionConfig, {
            Enabled: action === 'Enable' ? true : false
        });

        cloudfront.updateDistribution({
            DistributionConfig: distributionConfig,
            Id: id,
            IfMatch: distribution.ETag
        }, (err, data) => {
            if(err) return reject(err);
            resolve(data);
        });
    });
};

const deleteDistribution = (id, updateResult) => {
    return new Promise((resolve, reject) => {
        console.log(`Attempting to delete distribution: ${id}`);
        cloudfront.deleteDistribution({
            Id: id,
            IfMatch: updateResult.ETag
        }, (err, data) => {
            if(err) return reject(err);
            resolve(data);
        });
    });
}