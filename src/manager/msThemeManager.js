const { GLib, Gio, St } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { getSettings } = Me.imports.src.utils.settings;
const { MsManager } = Me.imports.src.manager.msManager;

/* exported MsThemeManager */
var MsThemeManager = class MsThemeManager extends MsManager {
    constructor() {
        super();
        this.themeContext = St.ThemeContext.get_for_stage(global.stage);
        this.theme = this.themeContext.get_theme();
        this.themeSettings = getSettings('theme');
        this.themeFile = Gio.file_new_for_path(
            `${GLib.get_user_cache_dir()}/${Me.uuid}-theme.css`
        );
        this.themeValue = this.themeSettings.get_string('theme');
        this.primary = this.themeSettings.get_string('primary-color');
        this.observe(this.themeSettings, 'changed::theme', (schema) => {
            this.themeValue = schema.get_string('theme');
            this.regenerateStylesheet();
        });
        this.observe(this.themeSettings, 'changed::primary-color', (schema) => {
            this.primary = schema.get_string('primary-color');
            this.regenerateStylesheet();
        });
        this.observe(this.themeSettings, 'changed::panel-size', () => {
            this.emit('panel-size-changed');
        });

        this.regenerateStylesheet();
    }

    getPanelSize(monitorIndex) {
        return (
            this.themeSettings.get_int('panel-size') *
            global.display.get_monitor_scale(monitorIndex)
        );
    }

    getPanelSizeNotScaled() {
        return this.themeSettings.get_int('panel-size');
    }

    isColorDark(color) {
        color = color.replace('#', '');
        let r = parseInt(color.substring(0, 2), 16);
        let g = parseInt(color.substring(2, 4), 16);
        let b = parseInt(color.substring(4, 6), 16);
        let linearColors = [r / 255, g / 255, b / 255];

        for (var i = 0; i < linearColors.length; ++i) {
            if (linearColors[i] <= 0.03928) {
                linearColors[i] = linearColors[i] / 12.92;
            } else {
                linearColors[i] = Math.pow(
                    (linearColors[i] + 0.055) / 1.055,
                    2.4
                );
            }
        }

        let luminance =
            0.2126 * linearColors[0] +
            0.7152 * linearColors[1] +
            0.0722 * linearColors[2];
        return luminance < 0.179;
    }

    async readFileContent(file) {
        return new Promise((resolve, reject) => {
            file.load_contents_async(null, (obj, res) => {
                let [success, contents] = obj.load_contents_finish(res);
                let content;
                if (success) {
                    //Read the binay content as string
                    content = imports.byteArray.toString(contents);
                    resolve(content);
                } else {
                    reject(success);
                }
            });
        });
    }

    async writeContentToFile(content, file) {
        return new Promise((resolve, reject) => {
            const contentBytes = new GLib.Bytes(content);
            file.replace_async(
                null,
                false,
                Gio.FileCreateFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null,
                (file, res) => {
                    let stream = file.replace_finish(res);

                    stream.write_bytes_async(
                        contentBytes,
                        GLib.PRIORITY_DEFAULT,
                        null,
                        (ioStream, wRes) => {
                            ioStream.write_bytes_finish(wRes);
                            stream.close(null);
                            resolve(file);
                        }
                    );
                }
            );
        });
    }

    async buildThemeStylesheetToFile(file) {
        let originThemeFile = Gio.file_new_for_path(
            `${Me.path}/style-${this.themeValue}-theme.css`
        );
        let content = await this.readFileContent(originThemeFile);
        content = content.replace(/#3f51b5/g, this.primary); // color-primary
        await this.writeContentToFile(content, file);
    }

    async regenerateStylesheet() {
        await this.buildThemeStylesheetToFile(this.themeFile);
        this.theme.unload_stylesheet(this.themeFile);
        this.theme.load_stylesheet(this.themeFile);
    }

    destroy() {
        super.destroy();
        this.theme.unload_stylesheet(this.themeFile);
    }
};