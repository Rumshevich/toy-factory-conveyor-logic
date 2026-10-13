

const scriptsInEvents = {

	async EventSheet1_Event50_Act1(runtime, localVars)
	{
		const toScreen = instance => {
			const [x, y] = instance.layer.layerToCssPx(instance.x, instance.y);
			return { uid: instance.uid, x, y };
		};
		runtime.setReturnValue(JSON.stringify({
			details: runtime.objects.Detail.getAllInstances().map(toScreen),
			bodies: runtime.objects.BodyGraphic.getAllInstances().map(toScreen)
		}));
	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
