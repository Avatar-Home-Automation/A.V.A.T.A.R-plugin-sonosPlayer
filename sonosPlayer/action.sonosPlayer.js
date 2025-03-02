import {default as _helpers} from '../../ia/node_modules/ava-ia/helpers/index.js'

export default function (state) {

	return new Promise((resolve) => {
		setTimeout(() => { 
			state.action = {
				module: 'sonosPlayer',
				command: state.rule
			};
			resolve(state);
		}, Config.waitAction.time);
	});

};
