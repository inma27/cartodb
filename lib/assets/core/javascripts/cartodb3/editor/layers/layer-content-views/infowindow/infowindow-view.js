var Backbone = require('backbone');
var CoreView = require('backbone/core-view');
var _ = require('underscore');
var checkAndBuildOpts = require('../../../../helpers/required-opts');
var PanelWithOptionsView = require('../../../../components/view-options/panel-with-options-view');
var InfoWindowHTMLView = require('./infowindow-html-view');
var InfowindowContentView = require('./infowindow-content-view');
var ScrollView = require('../../../../components/scroll/scroll-view');
var TabPaneView = require('../../../../components/tab-pane/tab-pane-view');
var TabPaneCollection = require('../../../../components/tab-pane/tab-pane-collection');
var Toggler = require('../../../../components/toggler/toggler-view');
var ApplyView = require('./infowindow-apply-button-view');
var Infobox = require('../../../../components/infobox/infobox-factory');
var InfoboxModel = require('../../../../components/infobox/infobox-model');
var InfoboxCollection = require('../../../../components/infobox/infobox-collection');

var cdb = require('cartodb.js');

var REQUIRED_OPTS = [
  'editorModel',
  'layerDefinitionModel',
  'userActions'
];

module.exports = CoreView.extend({

  initialize: function (opts) {
    checkAndBuildOpts(opts, REQUIRED_OPTS, this);

    this._initModels();
    this._initBinds();
    this._configPanes();
    this._initTemplates();
  },

  _initModels: function () {
    var content;
    if (this.model.isCustomTemplate()) {
      content = this.model.get('template');
    } else {
      content = this._getTemplateContent();
    }

    this._codemirrorModel = new Backbone.Model({
      content: content
    });

    this._infoboxModel = new InfoboxModel({
      state: this._isLayerHidden() ? 'layer-hidden' : ''
    });

    this._overlayModel = new Backbone.Model({
      visible: this._isLayerHidden()
    });

    // Set edition attribute in case custom html is applied and
    // in case none template is applied
    this._editorModel.set({
      edition: this.model.isCustomTemplate(),
      disabled: !this.model.hasTemplate() && !this.model.isCustomTemplate()
    });

    this._togglerModel = new Backbone.Model({
      labels: [_t('editor.infowindow.html-toggle.values'), _t('editor.infowindow.html-toggle.html')],
      active: this._editorModel.isEditing(),
      disabled: this._editorModel.isDisabled(),
      isDisableable: true
    });
  },

  _setContent: function () {
    if (this._editorModel.get('edition')) {
      return;
    }

    var html_value = this._getTemplateContent();
    this._codemirrorModel.set({
      content: html_value
    });
  },

  _initBinds: function () {
    this.listenTo(this.model, 'change', this._onChange.bind(this), this.model);
    this.listenTo(this._editorModel, 'change:edition', this._onChangeEdition);
    this.listenTo(this._editorModel, 'change:disabled', this._onChangeDisabled);
    this.listenTo(this._togglerModel, 'change:active', this._onTogglerChanged);
    this.listenTo(this._layerDefinitionModel, 'change:visible', this._infoboxState);
  },

  _saveInfowindowHTML: function () {
    var content = this._codemirrorModel.get('content');
    // Parse
    var errors = this._getErrors(content);

    if (errors.length === 0) {
      this._clearErrors();

      // Save old fields
      if (!this.model.get('old_fields')) {
        this.model.saveFields();
      }

      // Save old template name
      if (!this.model.get('old_template_name')) {
        this.model.set('old_template_name', this.model.get('template_name'));
      }

      // new custom template
      this.model.set({
        template: content,
        template_name: ''
      });

      this._userActions.saveLayer(this._layerDefinitionModel);
    } else {
      this._parseErrors(errors);
    }
  },

  _getErrors: function (content) {
    try {
      var template = new cdb.core.Template({
        template: content,
        type: 'mustache'
      });
      template.compile()();
      if (content === '') {
        return [{
          line: 1,
          message: _t('editor.infowindow.code-mirror.errors.empty')
        }];
      } else {
        return [];
      }
    } catch (e) {
      return e;
    }
  },

  _showErrors: function (model) {
    var errors = this._querySchemaModel.get('query_errors');
    this._codemirrorModel.set('errors', this._parseErrors(errors));
  },

  _parseErrors: function (errors) {
    return errors.map(function (error) {
      return {
        line: error.line,
        message: error.message.split('\n\n')[1]
      };
    });
  },

  _clearErrors: function () {
    this._codemirrorModel.set({errors: []});
  },

  _getTemplateContent: function () {
    var fields = [];
    var alternative_names = this.model.get('alternative_names');

    _.each(this.model.get('fields'), function (field, i) {
      var f = _.clone(field);
      f.position = i;
      if (alternative_names && alternative_names[f.name]) {
        f.alternative_name = alternative_names[f.name];
      }
      fields.push(f);
    });

    var tmpl = new cdb.core.Template({
      template: this.model.getTemplate(),
      type: 'mustache'
    });

    return tmpl.render({content: { fields: fields }});
  },

  _configPanes: function () {
    var self = this;

    var tabPaneTabs = [{
      selected: !self.model.isCustomTemplate(),
      createContentView: function () {
        return new ScrollView({
          createContentView: function () {
            return new InfowindowContentView(_.extend(self.options, {
              templates: self._templates,
              overlayModel: self._overlayModel
            }));
          }
        });
      },
      createActionView: function () {
        return new CoreView();
      }
    }, {
      selected: self.model.isCustomTemplate(),
      createContentView: function () {
        return new InfoWindowHTMLView({
          onApplyEvent: self._saveInfowindowHTML.bind(self),
          codemirrorModel: self._codemirrorModel
        });
      },
      createActionView: function () {
        return new ApplyView({
          onApplyClick: self._saveInfowindowHTML.bind(self)
        });
      }
    }];

    this._collectionPane = new TabPaneCollection(tabPaneTabs);
  },

  _onChange: function () {
    this._userActions.saveLayer(this._layerDefinitionModel);
    this._setContent();
  },

  _onChangeEdition: function () {
    this._infoboxState();

    var edition = this._editorModel.get('edition');
    var index = edition ? 1 : 0;
    this._collectionPane.at(index).set({ selected: true });
  },

  _onChangeDisabled: function () {
    var disabled = this._editorModel.get('disabled');
    this._togglerModel.set({ disabled: disabled });
  },

  _onTogglerChanged: function () {
    var checked = this._togglerModel.get('active');
    this._editorModel.set({ edition: checked });
  },

  _cancelHTML: function () {
    this.model.setDefault();
    this._infoboxModel.set({state: ''});
    this._overlayModel.set({visible: false});
  },

  _isLayerHidden: function () {
    return this._layerDefinitionModel.get('visible') === false;
  },

  _infoboxState: function () {
    var edition = this._editorModel.get('edition');
    var customTemplate = this.model.isCustomTemplate();

    if (!edition && customTemplate) {
      this._infoboxModel.set({ state: 'confirm' });
      this._overlayModel.set({ visible: true });
    } else if (!edition && this._isLayerHidden()) {
      this._infoboxModel.set({ state: 'layer-hidden' });
      this._overlayModel.set({ visible: true });
    } else {
      this._infoboxModel.set({ state: '' });
      this._overlayModel.set({ visible: false });
    }
  },

  _showHiddenLayer: function () {
    var savingOptions = {
      shouldPreserveAutoStyle: true
    };
    this._layerDefinitionModel.toggleVisible();
    this._userActions.saveLayer(this._layerDefinitionModel, savingOptions);
  },

  render: function () {
    this.clearSubViews();

    var self = this;

    var infoboxSstates = [
      {
        state: 'confirm',
        createContentView: function () {
          return Infobox.createWithAction({
            type: 'alert',
            title: _t('editor.infowindow.messages.custom-html-applied.title'),
            body: _t('editor.infowindow.messages.custom-html-applied.body'),
            mainAction: {
              label: _t('editor.infowindow.messages.custom-html-applied.accept')
            }
          });
        },
        mainAction: self._cancelHTML.bind(self)
      }, {
        state: 'layer-hidden',
        createContentView: function () {
          return Infobox.createWithAction({
            type: 'alert',
            title: _t('editor.messages.layer-hidden.title'),
            body: _t('editor.messages.layer-hidden.body'),
            mainAction: {
              label: _t('editor.messages.layer-hidden.show')
            }
          });
        },
        mainAction: self._showHiddenLayer.bind(self)
      }
    ];

    var infoboxCollection = new InfoboxCollection(infoboxSstates);

    var panelWithOptionsView = new PanelWithOptionsView({
      className: 'Editor-content',
      editorModel: self._editorModel,
      infoboxModel: self._infoboxModel,
      infoboxCollection: infoboxCollection,
      createContentView: function () {
        return new TabPaneView({
          collection: self._collectionPane
        });
      },
      createControlView: function () {
        return new Toggler({
          model: self._togglerModel
        });
      },
      createActionView: function () {
        return new TabPaneView({
          collection: self._collectionPane,
          createContentKey: 'createActionView'
        });
      }
    });

    this.$el.append(panelWithOptionsView.render().el);
    this.addView(panelWithOptionsView);

    return this;
  },

  clean: function () {
    this.model.unbind('change', null, this.model);
    CoreView.prototype.clean.apply(this);
  }
});
