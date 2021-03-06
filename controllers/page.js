var promise     = require('bluebird');

var botconfig   = require('../config/botconfig');
var mysql	= require('easy-mysql-promise')(botconfig.database.config);

module.exports = function()
{
	return new Pagectl();
}

/**
 * @constructs Page_Controller
 * @public
 */
function Pagectl(){}

/**
 * Verifies if a given page id is valid
 * @param {String} page_id - The facebook page id
 * @return {Boolean} A boolean response
 */
Pagectl.prototype.isValidPage = function isValidPage(page_id, type)
{
  if(type=='facebook')
    return (botconfig.facebook && botconfig.facebook.pages && botconfig.facebook.pages.hasOwnProperty(page_id)) ? true : false;
  else if(type=='slack')
    return (botconfig.slack && botconfig.slack.apps && botconfig.slack.apps.hasOwnProperty(page_id)) ? true : false;
}

/**
 * Gets the slack instance information and config by a given page id
 * @param {String} page_id - The slack page id
 * @param {Object} callback_data - An object to be returned to pipe to response
 * @return {PageConfig} A bluebird promise response with a PageConfig object
 */
Pagectl.prototype.getSlackPageInfo = function getSlackPageInfo(page_id, callback_data)
{
  var _this = this;
  return new promise(function(resolve)
	{
		if(_this.isValidPage(page_id, 'slack'))
			resolve({page:{type: 'slack', id: page_id, token: botconfig.slack.apps[page_id].bot_token, language: 'en'}, data: callback_data});
		else
		{
			var sql = 'SELECT * FROM ' + botconfig.database.pages_table + ' WHERE page_id="' + page_id + '";';

			mysql.query(sql)
			.then(function(response)
			{
				if(response)
				{
					var token = (response.hasOwnProperty('token')) ? response.token : false;
					var language = (response.hasOwnProperty('language')) ? response.language : false;

					response = {page:{type: 'slack', id: response.page_id, token: token , language: language}, data: callback_data};
				}

				resolve(response);
			});
		}
  });
}

/**
 * Gets the facebook page information and config by a given page id
 * @param {String} page_id - The facebook page id
 * @param {Object} callback_data - An object to be returned to pipe to response
 * @return {PageConfig} A bluebird promise response with a PageConfig object
 */
Pagectl.prototype.getFacebookPageInfo = function getFacebookPageInfo(page_id, callback_data)
{
  var _this = this;
  return new promise(function(resolve)
	{
		if(_this.isValidPage(page_id, 'facebook'))
			resolve({page:{type: 'facebook', id:page_id, token:botconfig.facebook.pages[page_id].pageToken, language:botconfig.facebook.pages[page_id].language}, data:callback_data});
		else
		{
			var sql = 'SELECT * FROM ' + botconfig.database.pages_table + ' WHERE page_id="'+page_id+'";';

			mysql.query(sql)
			.then(function(response)
			{
				if(response)
				{
					var token = (response.hasOwnProperty('token')) ? response.token : false;
					var language = (response.hasOwnProperty('language')) ? response.language : false;

					response = {page:{type: 'facebook', id: response.page_id, token: token , language: language}, data: callback_data};
				}

				resolve(response);
			});
		}
  });
}

/**
 * Gets the facebook page token and config by a given page id
 * @param {String} page_id - The facebook page id
 * @param {Object} callback_data - An object to be returned to pipe to response
 * @return {PageConfig} A bluebird promise response with a PageConfig object
 */
Pagectl.prototype.getFacebookPageToken = function getFacebookPageToken(page_id, callback_data)
{
  var _this = this;
  return new promise(function(resolve)
	{
		if(_this.isValidPage(page_id, 'facebook'))
			resolve({token:botconfig.facebook.pages[page_id].pageToken, data:callback_data});
		else
		{
			var sql = 'SELECT * FROM ' + botconfig.database.pages_table + ' WHERE page_id="'+page_id+'";';

			mysql.query(sql)
			.then(function(response)
			{
				if(response)
					response = (response.hasOwnProperty('token')) ? response.token : false;

				resolve({token:response, data:callback_data});
			});
		}
	});
}

/**
 * Gets the facebook page language and config by a given page id
 * @param {String} page_id - The facebook page id
 * @param {Object} callback_data - An object to be returned to pipe to response
 * @return {PageConfig} A bluebird promise response with a PageConfig object
 */
Pagectl.prototype.getFacebookPageLanguage = function getFacebookPageLanguage(page_id, callback_data)
{
  var _this = this;
  return new promise(function(resolve)
	{
		if(_this.isValidPage(page_id, 'facebook'))
			resolve({language: botconfig.facebook.pages[page_id].language, data: callback_data});
		else
		{
			var sql = 'SELECT * FROM ' + botconfig.database.pages_table + ' WHERE page_id="'+page_id+'";';

			mysql.query(sql)
			.then(function(response)
			{
				if(response)
					response = (response.hasOwnProperty('language')) ? response.language : false;

				resolve({language: response, data: callback_data});
			});
		}
	});
}

/**
 * Gets the facebook page id by a given language
 * @param {String} language - The language string - Eg. "en"
 * @return {String} The facebook page id, if any
 */
Pagectl.prototype.getFacebookPageByLanguage = function getFacebookPageByLanguage(language)
{
	var page_id = false;

	for(var k in botconfig.facebook.pages)
	{
		var page_language = botconfig.facebook.pages[k].language;
		var page_type = botconfig.facebook.pages[k].type;

		if(botconfig.env==page_type && language==page_language)
		{
			page_id = k;
			break;
		}
	}

	return page_id;
}