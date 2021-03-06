var promise 		= require('bluebird');

var botconfig 		= require('../config/botconfig');

var debugutil 		= require('../utils/debugutil');
var utility 		= require('../utils/utility');
var botutil 		= require('../utils/botutil');

module.exports = function(userctl, botctl, scriptctl, updatectl, facebookctl)
{
	return new Messagectl(userctl, botctl, scriptctl, updatectl, facebookctl);
}

function Messagectl(userctl, botctl, scriptctl, updatectl, facebookctl)
{
	this.userctl = userctl || require('./user')();
	this.botctl = botctl || require('./bot')();
	this.scriptctl = scriptctl || require('./script')();
	this.updatectl = updatectl || require('./update')();
	this.facebookctl = facebookctl || require('./facebook')();

	this.replyqueue = {};
	this.inputqueue = {};

	//callback functions
	this.onFinishFacebookMessageDispatch = false;
	this.onFinishAllFacebookMessageDispatch = false;
	this.onFinishMessageDispatch = false;
	this.onFinishAllMessageDispatch = false;
	this.onHandleCustomMessageReplyItems = false;
}

/**
 * Sends a message to messenger
 * @param {Event} event - A NGINB event object
 * @param {Object} user_data - If you have a previous loaded userdata, you can send it here
 * @return {Object} A bluebird promisse response
 */
Messagectl.prototype.processMessengeEvent = function processMessengeEvent(event, user_data)
{
	var self = this;
	return new promise(function(resolve)
	{
		if(isCommandFromMessage(event.type, event.text))
			event.text = 'cmdimsmart';

		registerUser(self, event.sender);

		if(!isInInputQueue(self, event.sender, event.text))
		{
			self.inputqueue[event.sender].push(event);

			if(self.inputqueue[event.sender].length<=1)
			{
				if(event.sender!='' && event.page.id!='')
				{
					if(user_data)
					{
						event.userdata = user_data;
						self.dispatchEvent(event)
						.then(function(dispatch_event)
						{
							resolve(dispatch_event);
						});
					}
					else
					{
						self.userctl.getUserData(event.sender, event.page, event.lang)
						.then(function(user_response)
						{
							debugutil.log('user_response', user_response);

							event.userdata = user_response;
							self.dispatchEvent(event)
							.then(function(dispatch_event)
							{
								resolve(dispatch_event);
							});
						});
					}
				}
			}
		}
	});
}

/**
 * Dispatch an event, can dispatch diretctly or using a bot
 * @param {Event} event - A NGINB event object
 * @return {Object} a bluebird promisse response
 */
Messagectl.prototype.dispatchEvent = function dispatchEvent(event)
{
	var self = this;
	return new promise(function(resolve)
	{
		registerUser(self, event.sender);

		if(event.text && event.text.indexOf('<')!=-1 && event.text.indexOf('>')!=-1)
		{
			var messages = botutil.getVariablesObjectFromString(event.text);
			if(messages[0].text==event.text)
			{
				if(event.userdata.status && event.userdata.status>0)
				{
					self.processBotEvent(event)
					.then(function(response)
					{
						resolve(response);
					});
				}
			}
			else
			{
				self.replyqueue[event.sender].push.apply(self.replyqueue[event.sender], messages);
				self.dispatchMessage(messages[0], event);
				resolve({status:1, message:'direct message(s) dispactched', data:messages});
			}
		}
		else
		{
			if(event.userdata.status && event.userdata.status>0)
			{
				self.processBotEvent(event)
				.then(function(response)
				{
					resolve(response);
				});
			}
		}
	});
}

/**
 * Process a bot event
 * @param {Event} event - A NGINB event object
 * @return {Object} a bluebird promisse response
 */
Messagectl.prototype.processBotEvent = function processBotEvent(event)
{
	var self = this;
	return new promise(function(resolve)
	{
		registerUser(self, event.sender);

		debugutil.log('event_response', 'page:' + event.page.id, 'sender:' + event.sender, 'type:' + event.type, 'text:' + event.text, 'lang:' + event.lang);

		event.userdata.now = Date.now();
		event.userdata.lang = event.lang;
		self.botctl.setUservars(event.sender, event.userdata, event.lang);

		if(event.type == "attachment")
		{
			if(event.id==369239263222822)
				event.text = "cmdattachmentlike";
			else
				event.text = "cmdattachmentsent";
		}

		self.botctl.processEvent(event)
		.then(function(bot_response)
		{
			self.dispatchDirectMessage(bot_response.reply, bot_response.event);
			resolve({status:1, message:'bot message(s) dispactched', data:bot_response.reply});
		});
	});
}

/**
 * Dispatch a message directly
 * @param {Object} message, an object with message params, the "text" key is required
 * @param {Event} event - A NGINB event object to send to next line if needed
 * @return {Object} a bluebird promisse response
 */
Messagectl.prototype.dispatchDirectMessage = function dispatchDirectMessage(message, event)
{
	var self = this;

	registerUser(self, event.sender);

	message = (message.length==undefined) ? [message] : message;
	var dispatch = (self.replyqueue[event.sender].length==0) ? true : false;

	self.replyqueue[event.sender].push.apply(self.replyqueue[event.sender], message);

	if(event.userdata==undefined)
		event.userdata = self.botctl.getUservars(event.sender, event.lang);

	event.userdata = (event.userdata==undefined) ? {} : event.userdata;  

	if(dispatch)
		self.dispatchMessage(message[0], event);
}

/**
 * Dispatch a message
 * @param {Object} message, an object with message params, the text key is required
 * @param {Event} event - A NGINB event object to send to next line if needed
 * @return {Object} a bluebird promisse response
 */
Messagectl.prototype.dispatchMessage = function dispatchMessage(message, event)
{
	var _this = this;
	debugutil.log('message_dispatched', message);

	var i;
	var dispatch_message = true;
	var dispatch_next = true;
	var dispatch_data = {action:false, update:false};

	if(message.storage)
		_this.updatectl.processUpdate(event.sender, event.page.id, {[botconfig.botconfig.storagetable]: {storage: message.storage}});

	//if it has an if, execute a comparation and if false, skip the line
	if(message.if)
		dispatch_message = utility.if(message.if, event.userdata);

	//if it has an ifbreak, execute a comparation and if false, break the queue
	if(message.ifbreak)
	{
		dispatch_message = utility.if(message.ifbreak, event.userdata);
		dispatch_next = false;
	}

	if(dispatch_message)
	{
		if(message.text)
			message.text = botutil.replaceVariable(message.text, event.userdata);

		//if it has some scripts do the scripts
		if(message.script)
		{
			var params = message.hasOwnProperty('script_params') ? message.script_params : false;
			dispatch_data.script = _this.scriptctl.processFunction(event.sender, event.page.id, message.script, event, params);
		}

		//if it has some updates, so update
		if(message.update)
		{
			_this.updatectl.processUpdate(event.sender, event.page.id, message.update, event.userdata);
			dispatch_data.update = true;
		}

		//if it has next call to bot, call bot again
		if(message.next)
		{
			if(typeof(message.next)=='string')
			{
				event.text = message.next;
				_this.processBotEvent(event);
			}
			else if(typeof(message.next)=='object' && message.next.length!=undefined)
			{
				for(i = 0; i<message.next.length; i++)
				{
					event.text = message.next[i];
					_this.processBotEvent(event);
				}
			}
		}

		if(message.attachment)
		{
			var message_attachment = {};
			if(typeof(message.attachment)=='string')
			{
				message_attachment =
				{
					text: 'attachment',
					attachment_data: message.attachment
				};

				if(message.text=='' && !message.hasOwnProperty('quickreply'))
					message = message_attachment;
				else
				{
					if(_this.replyqueue[event.sender])
						_this.replyqueue[event.sender].splice(1, 0, message_attachment);
				}
			}
			else if(typeof(message.attachment)=='object')
			{
				var attachments = [];

				if(message.attachment.length==undefined)
					attachments.push(message.attachment);
				else
					attachments = message.attachment;

				for(i = 0; i<attachments.length; i++)
				{
					message_attachment =
					{
						text: 'attachment',
						attachment_data: attachments[i]
					};

					if(i == 0 && message.text=='' && !message.hasOwnProperty('quickreply'))
						message = message_attachment;
					else
					{
						if(_this.replyqueue[event.sender])
							_this.replyqueue[event.sender].splice(1 + i, 0, message_attachment);
					}
				}
			}
		}

		if(_this.onHandleCustomMessageReplyItems)
			dispatch_data.action = _this.onHandleCustomMessageReplyItems(message, event);

		dispatch_data.action = (dispatch_data.action==undefined) ? false : dispatch_data.action;

		if(message.text!=undefined)
		{
			var delay = (message.delay) ? Number(message.delay) * 1000 : 0;
			delay = (isNaN(delay)) ? 0 : delay;

			if(botconfig.botconfig.humanize && message.text!='attachment')
			{
				var chance = (event.userdata.hasOwnProperty('error_chance')) ? event.userdata.error_chance : botconfig.botconfig.typing_error_chance;
				var byword = (event.userdata.hasOwnProperty('error_byword')) ? event.userdata.error_byword : false;

				message.text = botutil.humanizeString(message.text, event.lang, chance, byword);
			}

			if(botconfig.botconfig.typing_delay)
				delay += botutil.getTypingDelay(message.text);

			if(botconfig.facebook.send_to)
			{
				_this.sendMessageToFacebook(_this, event, message, dispatch_data, delay);
			}
			else if(botconfig.slack.send_to)
			{
				_this.sendMessageToSlack(_this, event, message, dispatch_data, delay);
			}
			else
				_this.dispatchNextResponse(event, dispatch_data);
		}
		else
			_this.dispatchNextResponse(event, dispatch_data);
	}
	else
	{
		if(dispatch_next)
			_this.dispatchNextResponse(event, dispatch_data);
		else
		{
			if(_this.replyqueue.hasOwnProperty(event.sender))
				_this.replyqueue[event.sender] = [];

			_this.dispatchNextResponse(event, dispatch_data);
		}
	}
}

Messagectl.prototype.sendMessageToSlack = function sendMessageToSlack(_this, event, message, dispatch_data, delay)
{
	var app = event.page;
	var sender = event.sender;

	_this.slackctl.getMessage(app, sender, message, event.lang, event.userdata)
	.then(function(slack_message)
	{
		//if(!message.delay && delay>botconfig.botconfig.time_for_typing_on)
			//_this.slackctl.sendAction(app, sender, 'typing_on');

		promise.delay(delay).then(function()
		{
			var gotonext = true;

			debugutil.log('slack_send_object', JSON.stringify(slack_message));

			if(slack_message.text!='')
			{
				gotonext = false;
				_this.slackctl.sendMessage(app, sender, slack_message, event)
				.then(function(sl_response)
				{
					debugutil.log('slack_response', sl_response.data.body);

					var last = _this.replyqueue[event.sender].length == 1 ? true : false;

					if(_this.onFinishSlackMessageDispatch)
						_this.onFinishSlackMessageDispatch({sl_response: sl_response, event: event, dispatch_data: dispatch_data});

					if(last && _this.onFinishAllSlackMessageDispatch)
						_this.onFinishAllSlackMessageDispatch({sl_response: sl_response, event: event, dispatch_data: dispatch_data});

					_this.dispatchNextResponse(sl_response.callback_data, dispatch_data);
				});
			}

			if(gotonext)
				_this.dispatchNextResponse(event, dispatch_data);
		});
	});
}

Messagectl.prototype.sendMessageToFacebook = function sendMessageToFacebook(_this, event, message, dispatch_data, delay)
{
	var page = event.page;
	var sender = event.sender;
	
	_this.facebookctl.getFacebookMessage(event.sender, page.id, message, event.lang, event.userdata)
	.then(function(facebook_message)
	{
		if(!message.delay && delay>botconfig.botconfig.time_for_typing_on)
			_this.facebookctl.sendAction(page, sender, 'typing_on');

		promise.delay(delay).then(function()
		{
			var gotonext = true;

			debugutil.log('facebook_send_object', JSON.stringify(facebook_message));

			if(facebook_message.text!='')
			{
				gotonext = false;
				_this.facebookctl.sendMessage(page, sender, facebook_message, event)
				.then(function(fb_response)
				{
					debugutil.log('facebook_response', fb_response.data.body);

					var last = _this.replyqueue[event.sender].length==1 ? true : false;

					if(_this.onFinishFacebookMessageDispatch)
						_this.onFinishFacebookMessageDispatch({fb_response:fb_response, event:event, dispatch_data:dispatch_data});

					if(last && _this.onFinishAllFacebookMessageDispatch)
						_this.onFinishAllFacebookMessageDispatch({fb_response:fb_response, event:event, dispatch_data:dispatch_data});

					_this.dispatchNextResponse(fb_response.callback_data, dispatch_data);
				});
			}

			if(message.template)
			{
				gotonext = false;
				_this.facebookctl.getFacebookTemplate(event.sender, page.id, message, event.lang, event.userdata)
				.then(function(facebook_template)
				{
					debugutil.log('facebook_template_object', JSON.stringify(facebook_template));

					_this.facebookctl.sendMessage(page, sender, facebook_template, event)
					.then(function(fb_response)
					{
						debugutil.log('facebook_response', fb_response.data.body);

						if(message.text=='')
						{
							var last = _this.replyqueue[event.sender].length==1 ? true : false;

							if(_this.onFinishFacebookMessageDispatch)
								_this.onFinishFacebookMessageDispatch({fb_response:fb_response, event:event, dispatch_data:dispatch_data});

							if(last && _this.onFinishAllFacebookMessageDispatch)
								_this.onFinishAllFacebookMessageDispatch({fb_response:fb_response, event:event, dispatch_data:dispatch_data});

							_this.dispatchNextResponse(fb_response.callback_data, dispatch_data);
						}
					});
				});
			}

			if(gotonext)
				_this.dispatchNextResponse(event, dispatch_data);
		});
	});
}

/**
 * Verify if response queue has next message and dispatch
 * @param {Event} event - A NGINB event object
 * @param {Object} dispatch_data - A custom object data to dispatch
 */
Messagectl.prototype.dispatchNextResponse = function dispatchNextResponse(event, dispatch_data)
{
	var self = this;
	var last = self.replyqueue[event.sender].length==1 ? true : false;

	if(self.onFinishMessageDispatch)
		self.onFinishMessageDispatch({event:event, dispatch_data:dispatch_data});

	if(last && self.onFinishAllMessageDispatch)
		self.onFinishAllMessageDispatch({event:event, dispatch_data:dispatch_data});

	if(event)
	{
		if(self.replyqueue.hasOwnProperty(event.sender))
		{
			//remove sent message from array
			if(self.replyqueue[event.sender].length>0)
				self.replyqueue[event.sender].splice(0, 1);

			//if array has more messages to dispatch, so dispatch
			if(self.replyqueue[event.sender].length>0)
				self.dispatchMessage(self.replyqueue[event.sender][0], event);
			else
				self.dispatchNextInput(event);
		}
		else
			self.dispatchNextInput(event);
	}
}

/**
 * Verify if input queue has a next message and dispatch
 * @param {Event} event - A NGINB event object
 */
Messagectl.prototype.dispatchNextInput = function dispatchNextInput(event)
{
	var self = this;
	if(self.inputqueue.hasOwnProperty(event.sender))
	{
		//remove input message from array
		self.inputqueue[event.sender].splice(0, 1);

		//if array has more messages to dispatch, so dispatch
		if(self.inputqueue[event.sender].length>0)
		{
			if(event.hasOwnProperty('userdata'))
				self.inputqueue[event.sender][0].userdata = event.userdata;

			self.dispatchEvent(self.inputqueue[event.sender][0]);
		}
	}
}

/**
 * Private function to to register user in input queue and reply queue
 * @private
 * @param {Message_Controller} self - This instance of Message Controller
 * @param {String} sender - The facebook user pid
 */
function registerUser(self, sender)
{
	if(!self.inputqueue.hasOwnProperty(sender))
		self.inputqueue[sender] = [];

	if(!self.replyqueue.hasOwnProperty(sender))
		self.replyqueue[sender] = [];
}

/**
 * Private function to verify if a message is in input queue
 * @private
 * @param {Message_Controller} self - This instance of Message Controller
 * @param {String} sender - The facebook user pid
 * @param {String} text - The text message to send
 */
function isInInputQueue(self, sender, text)
{
	var response = false;
	if(self.inputqueue.hasOwnProperty(sender))
	{
		for(var i=0, len=self.inputqueue[sender].length; i<len; i++)
		{
			if(self.inputqueue[sender][i].text==text)
			{
				response = true;
				break;
			}

		}
	}
	return response;
}

/**
 * Private function to verify a message contains any command
 * @private
 * @param {String} event_type, the type of the event
 * @param {String} event_text, the text of the event
 */
function isCommandFromMessage(event_type, event_text)
{
	var response = false;

	if(!debugutil.accept_commands_from_user && event_type!='payload')
	{
		var regex = /cmd\s*([^\n\r]*)/g;
		var matches = regex.exec(event_text);

		if(matches)
			response = true;
	}

	return response;
}
