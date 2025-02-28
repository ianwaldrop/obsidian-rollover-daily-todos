import { Notice, Plugin, Setting, PluginSettingTab } from 'obsidian';

export default class RolloverTodosPlugin extends Plugin {
	checkDailyNotesEnabled() {
		return this.app.vault.config.pluginEnabledStatus['daily-notes'];
	}

	getDailyNotesDirectory() {
		if (this.dailyNotesDirectory != null) {
			return this.dailyNotesDirectory;
		}

		this.dailyNotesDirectory = this.app.internalPlugins.plugins['daily-notes'].instance.options.folder;
		return this.dailyNotesDirectory;
	}

	getLastDailyNote() {
		const dailyNotesDirectory = this.getDailyNotesDirectory();
		
		const files = this.app.vault.getAllLoadedFiles()
			.filter(file => file.path.startsWith(dailyNotesDirectory))
			.filter(file => file.basename != null)
			.sort((a, b) => new Date(b.basename).getTime() - new Date(a.basename).getTime());

		return files[1];
	}

	async getAllUnfinishedTodos(file) {
		const contents = await this.app.vault.read(file);
		const unfinishedTodosRegex = /\t*- \[ \].*/g
		const unfinishedTodos = Array.from(contents.matchAll(unfinishedTodosRegex)).map(([todo]) => todo)
		return unfinishedTodos;
	}

	async onload() {
		this.settings = await this.loadData() || { templateHeading: 'none' };

		if (!this.checkDailyNotesEnabled()) {
			new Notice('Daily notes plugin is not enabled. Enable it and then reload Obsidian.', 2000)
		}

		this.addSettingTab(new RollverTodosSettings(this.app, this))

		this.registerEvent(this.app.vault.on('create', async (file) => {
			// is a daily note
			const dailyNotesDirectory = this.getDailyNotesDirectory()
			if (!file.path.startsWith(dailyNotesDirectory)) return;

			// is today's daily note
			const today = new Date();
			if (today.toISOString().slice(0, 10) !== file.basename) return;

			// was just created
			if (today.getTime() - file.stat.ctime > 1) return;

			const lastDailyNote = this.getLastDailyNote();
			if (lastDailyNote == null) return;

			const unfinishedTodos = await this.getAllUnfinishedTodos(lastDailyNote)
			
			let dailyNoteContent = await this.app.vault.read(file)

			if (this.settings.templateHeading !== 'none') {
				const heading = this.settings.templateHeading + '\n'
				dailyNoteContent = dailyNoteContent.replace(heading, heading + unfinishedTodos.join('\n') + '\n')
			} else {
				dailyNoteContent += unfinishedTodos.join('\n')
			}

			await this.app.vault.modify(file, dailyNoteContent);
		}))
	}
}

class RollverTodosSettings extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	async getTemplateHeadings() {
		const template = this.app.internalPlugins.plugins['daily-notes'].instance.options.template;
		if (!template) return [];
		
		const file = this.app.vault.getAbstractFileByPath(template + '.md')
		const templateContents = await this.app.vault.read(file)
		const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(([heading]) => heading)
		return allHeadings;
	}

	async display() {
		const templateHeadings = await this.getTemplateHeadings()

		this.containerEl.empty()
		new Setting(this.containerEl)
			.setName('Template heading')
			.setDesc('Which heading from your template should the todos go under')
			.addDropdown((dropdown) => dropdown
				.addOptions({
					...templateHeadings.reduce((acc, heading) => {
						acc[heading] = heading;
						return acc;
					}, {}),
					'none': 'None' 
				})
				.setValue(this.plugin?.settings.templateHeading)
				.onChange(value => {
					this.plugin.settings.templateHeading = value;
					this.plugin.saveData(this.plugin.settings)
				})
			)
		}
}
