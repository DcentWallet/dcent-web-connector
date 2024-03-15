/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

const defaultDeviceResponse = {
    getInfo: {
        header: {
            version: '1.0',
            response_from: 'device',
            status: 'success',
        },
        body: {
            command: 'get_info',
            parameter: {
                'device_id': '00112233445566778899AABBCCDDEEFF',
                'fw_version': '1.3.0.76ea',
                'ksm_version': '1.0.0.1139',
                'state': 'secure',
                'coin_list': [
                    { 'name': 'BITCOIN' },
                    { 'name': 'ETHEREUM' },
                    { 'name': 'ERC20' },
                    { 'name': 'RSK' },
                    { 'name': 'RRC20' },
                    { 'name': 'RIPPLE' },
                    { 'name': 'MONACOIN' },
                    { 'name': 'EOS' },
                ],
                'fingerprint': {
                    'max': 2,
                    'enrolled': 0,
                },
                'label': 'EUN-00',
            },
        },
    },
    setLabel: {
        header: {
            version: '1.0',
            response_from: 'device',
            status: 'success',
        },
        body: {
            command: 'set_label',
            parameter: {},
        },
    },
    syncAccount: {
        header: {
            version: '1.0',
            response_from: 'coin',
            status: 'success',
        },
        body: {
            command: 'sync_account',
            parameter: {},
        },
    },
    getAccountInfo: {
        header: {
            version: '1.0',
            response_from: 'device',
            status: 'success',
        },
        body: {
            command: 'get_account_info',
            parameter: {
                'account': [
                    {
                        'coin_group': 'ETHEREUM',
                        'coin_name': 'ETHEREUM',
                        'label': 'ether_1',
                        'address_path': 'm/44\'/60\'/0\'/0/0',
                    },
                    {
                        'coin_group': 'ERC20',
                        'coin_name': '0xd26114cd6EE28',
                        'label': 'OMG_1',
                        'address_path': 'm/44\'/60\'/0\'/0/0',
                    },
                ],
            },
        },
    },
    getXpub: {
        header: {
            version: '1.0',
            response_from: 'ethereum',
            status: 'success',
        },
        body: {
            command: 'xpub',
            parameter: {
                public_key: 'xpub6D9VtAezPSdV4prNu6vTSvQzjFQXp3EsAhq3REM6BwzVjbCpAhPBXuQuCEBZftGiERP8uqtEbVpnUEXKCAv4aB7AfdkubLZBZuCcCy4dZtF',
            },
        },
    },
    getAddressEth: {
        header: {
            version: '1.0',
            response_from: 'ethereum',
            status: 'success',
        },
        body: {
            command: 'get_address',
            parameter: {
                address: '0xe5c23dAa6480e45141647E5AeB321832150a28D4',
            },
        },
    },
    getAddressBtc: {
        header: {
            version: '1.0',
            response_from: 'bitcoin',
            status: 'success',
        },
        body: {
            command: 'get_address',
            parameter: {
                address: '15JYUDHdLyE98oATycpp1pb8MjBRQtZZob',
            },
        },
    },
    getAddressMona: {
        header: {
            version: '1.0',
            response_from: 'bitcoin',
            status: 'success',
        },
        body: {
            command: 'get_address',
            parameter: {
                address: 'MMXNNP5sSv6sZ1pP3tqQvNutTgu2bN73KN',
            },
        },
    },
    getAddressInvalid: {
        header: {
            version: '1.0',
            response_from: 'bridge',
            status: 'error',
        },
        body: {
            error: {
                code: 'coin_type_error',
                message: 'not support coin type',
            },
        },
    },
    getEthereumSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'ethereum',
            status: 'success',
        },
        body: {
            command: 'transaction',
            parameter: {
                'signed': '0xf8a915848f0d1800830f424094d26114cd6ee289accf82350c8d8487fedb8a0c0780b844a9059cbb000000000000000000000000354609c4c9a15d4265cf6d94010568d5cf4d0c1b000000000000000000000000000000000000000000000000016345785d8a000025a043e2e90a9679d3e3e3d578a9005df61fa5e5bed853a9e691c3d55798c6bfe0e0a07f9438574e2011619df432331204e8b3ff3faf5c62286347a73bcdf13843b0c6',
                'sign_v': '0x25',
                'sign_r': '0x43e2e90a9679d3e3e3d578a9005df61fa5e5bed853a9e691c3d55798c6bfe0e0',
                'sign_s': '0x7f9438574e2011619df432331204e8b3ff3faf5c62286347a73bcdf13843b0c6',
            },
        },
    },
    getTokenSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'ethereum',
            status: 'success',
        },
        body: {
            command: 'transaction',
            parameter: {
                'signed': '0xf8a915848f0d1800830f424094d26114cd6ee289accf82350c8d8487fedb8a0c0780b844a9059cbb000000000000000000000000354609c4c9a15d4265cf6d94010568d5cf4d0c1b000000000000000000000000000000000000000000000000016345785d8a000025a043e2e90a9679d3e3e3d578a9005df61fa5e5bed853a9e691c3d55798c6bfe0e0a07f9438574e2011619df432331204e8b3ff3faf5c62286347a73bcdf13843b0c6',
                'sign': {
                    'sign_v': '0x25',
                    'sign_r': '0x43e2e90a9679d3e3e3d578a9005df61fa5e5bed853a9e691c3d55798c6bfe0e0',
                    'sign_s': '0x7f9438574e2011619df432331204e8b3ff3faf5c62286347a73bcdf13843b0c6',
                },
            },
        },
    },
    getEthereumSignedMessage: {
        header: {
            version: '1.0',
            response_from: 'ethereum',
            status: 'success',
        },
        body: {
            command: 'msg_sign',
            parameter: {
                'address': '0x54b9c508aC61Eaf2CD8F9cA510ec3897CfB09382',
                'sign': '0x1d36f3c4142f1c8b14c70afb6093310af6e46cbe83ae386b021e2b03c157a9237120e47c869aa6c449eddde7d103647f82c0f5c2f5ab6649a6851c2bedde06601b',
            },
        },
    },
    getKlaytnSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'klaytn',
            status: 'success',
        },
        body: {
            command: 'transaction',
            'parameter': {
                'sign_v': '0x4056',
                'sign_r': '0xe80b33d305ca6c2ab0519ecf3aeb5af4628fbdf134d8316a2aa32975e0cbf3cf',
                'sign_s': '0x61b565596adaa43193744ea8944f36be7eef392237462dcd64886960fc63062a',
            },
        },
    },
    getSignedMessage: {
        header: {
            version: '1.0',
            response_from: 'bridge',
            status: 'error',
        },
        body: {
            error: {
                code: 'command_error',
                message: 'not support command',
            },
        },
    },
    getBitcoinSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'bitcoin',
            status: 'success',
        },
        body: {
            command: 'transaction',
            parameter: {
                signed: '0100000002233ee1fbcf38213de9933a44096de5880af7e9adafb3b2d0417a4ff1248b31ea010000006a473044022078c11dc7e6f83f8a95e6bbe95a870cbaac74f025cc2565e4f05ce7588b4b956402202a629768f78e10708a3d8537d0852e067279185f64fcc765309fac09de1add25012102d69564b9d04220fca66d0ed68f0d5bcdeba8021bc7385e30d973be3662c71b71ffffffff233ee1fbcf38213de9933a44096de5880af7e9adafb3b2d0417a4ff1248b31ea000000006a47304402201288aa5d68484de5cae63355de3a380cce08a93ef3b573ce15ea7248e3a7337a022055de4a72c069439050c22a84115f82d769ca23b3824507c24dc61d71d10ce036012103b20b2943add03533b34b53e1563cd3b89eb20763589c035dc6f9714746075583ffffffff0110270000000000001976a91409ce9aaea4672781106e066efe7d740c6cbd71e088ac00000000'
                }
        },
    },
    getXrpSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'ripple',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                sign: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
                pubkey: '02c65f2a496909123973282c47edbd0e760bb44bb0d87ec1b30115b2ce3072c766',
                accountId: '462a5a061ebe03fb52e5bca443233bcc6d0e9699'
            }
        }
    },
    getHederaSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'hedera',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                sign: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
                pubkey: '02c65f2a496909123973282c47edbd0e760bb44bb0d87ec1b30115b2ce3072c766'
            }
        }
    },
    getHederaSignedMessage: {
        header: {
            version: '1.0',
            response_from: 'hedera',
            status: 'success'
        },
        body: {
            command: 'sign_msg',
            parameter: {
                signed_msg: '6fb261a69f45f58d5dc33297a7db0fd80cbbd90137a2597ff870a374ecbd2cb99d22bac9a28e91a84902a6b5b0a4316a9c7d4e7ae242f2e2172d57d2a9b7530c',
                pubkey: '97ee5dbe1b00e35ac9674cdc9915503108acae33d9dc2aa2247e69d4e456c594',
            }
        }
    },
    getTezosSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'tezos',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                signed: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
            }
        }
    },
    getVechainSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'vechain',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                signed: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
            }
        }
    },
    getNearSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'near',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                signed: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
            }
        }
    },
    getHavahSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'havah',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                signed: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
            }
        }
    },
    getPolkadotSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'polkadot',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                signed: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
            }
        }
    },
    getCosmosSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'cosmos',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                signed: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
            }
        }
    },
    getAlgorandSignedTransaction: {
        header: {
            version: '1.0',
            response_from: 'algorand',
            status: 'success'
        },
        body: {
            command: 'get_sign',
            parameter: {
                signed: '3045022100fb4b7a28d3419651420ed6745601b72ec4e8a3ffbcbf3052ebb39b76fba1e0ba0220570ba64c9fd6f63982efb500857b29742d578e54e7c776c2b1230da23ebe238e',
            }
        }
    },
}

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */

export default {
    defaultDeviceResponse,
}

/* //////////////////////////////////////////////////////////////////////// */
/* */
/* //////////////////////////////////////////////////////////////////////// */
