

const scriptsInEvents = {

	async EventSheet1_Event64_Act1(runtime, localVars)
	{
		const toScreen = instance => {
			const [x, y] = instance.layer.layerToCssPx(instance.x, instance.y);
		
			return {
				uid: instance.uid,
				x,
				y,
				width: instance.width,
				height: instance.height
			};
		};
		
		const detailState = instance => ({
			...toScreen(instance),
		
			detailType: instance.instVars.DetailType,
			toyType: instance.instVars.ToyType,
			assemblyState: instance.instVars.AssemblyState,
		
			currentCellId: instance.instVars.CurrentCellId,
			targetCellId: instance.instVars.TargetCellId,
			previousCellId: instance.instVars.PreviousCellId,
		
			isDragging: instance.instVars.isDragging
		});
		
		const cellState = instance => ({
			...toScreen(instance),
			state: instance.instVars.State
		});
		
		runtime.setReturnValue(JSON.stringify({
			details: runtime.objects.Detail.getAllInstances().map(detailState),
			cells: runtime.objects.Cell.getAllInstances().map(cellState),
			bodies: runtime.objects.BodyGraphic.getAllInstances().map(toScreen)
		}));
	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
