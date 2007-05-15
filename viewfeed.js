var active_post_id = false;
var _catchup_callback_func = false;
var last_article_view = false;
var active_real_feed_id = false;

var _tag_active_post_id = false;
var _tag_active_feed_id = false;
var _tag_active_cdm = false;

// FIXME: kludge, to restore scrollTop after tag editor terminates
var _tag_cdm_scroll = false;

// FIXME: kludges, needs proper implementation
var _reload_feedlist_after_view = false;

var _cdm_wd_timeout = false;
var _cdm_wd_vishist = new Array();

var article_cache = new Array();

function catchup_callback() {
	if (xmlhttp_rpc.readyState == 4) {
		try {
			debug("catchup_callback");
			if (_catchup_callback_func) {
				setTimeout(_catchup_callback_func, 100);	
			}
			notify("");			
			all_counters_callback();
		} catch (e) {
			exception_error("catchup_callback", e);
		}
	}
}

function headlines_callback() {
	if (xmlhttp.readyState == 4) {
		debug("headlines_callback");
		var f = document.getElementById("headlines-frame");
		try {
			f.scrollTop = 0;
		} catch (e) { };
		f.innerHTML = xmlhttp.responseText;
		update_all_counters();
		if (typeof correctPNG != 'undefined') {
			correctPNG();
		}

		if (_cdm_wd_timeout) window.clearTimeout(_cdm_wd_timeout);

		if (!document.getElementById("headlinesList") && 
				getInitParam("cdm_auto_catchup") == 1) {
			debug("starting CDM watchdog");
			_cdm_wd_timeout = window.setTimeout("cdmWatchdog()", 5000);
			_cdm_wd_vishist = new Array();
		} else {
			debug("not in CDM mode or watchdog disabled");
		}

		if (_tag_cdm_scroll) {
			try {
				document.getElementById("headlinesInnerContainer").scrollTop = _tag_cdm_scroll;
				_tag_cdm_scroll = false;
			} catch (e) { }
		}

		notify("");
	}
}

function render_article(article) {
	try {
		var f = document.getElementById("content-frame");
		try {
			f.scrollTop = 0;
		} catch (e) { };

		f.innerHTML = article;

	} catch (e) {
		exception_error("render_article", e);
	}
}

function article_callback() {
	if (xmlhttp.readyState == 4) {
		debug("article_callback");

		try {
			if (xmlhttp.responseXML) {
				var reply = xmlhttp.responseXML.firstChild.firstChild;

				var articles = xmlhttp.responseXML.getElementsByTagName("article");

				for (var i = 0; i < articles.length; i++) {
					var a_id = articles[i].getAttribute("id");

					debug("found id: " + a_id);

					if (a_id == active_post_id) {
						debug("active article, rendering...");					
						render_article(articles[i].firstChild.nodeValue);
					}

					cache_inject(a_id, articles[i].firstChild.nodeValue);
				}
			
			} else {
				debug("article_callback: returned no XML object");
			}
		} catch (e) {
			exception_error("article_callback", e);
		}

		var date = new Date();
		last_article_view = date.getTime() / 1000;

		if (typeof correctPNG != 'undefined') {
			correctPNG();
		}

		if (_reload_feedlist_after_view) {
			setTimeout('updateFeedList(false, false)', 50);			
			_reload_feedlist_after_view = false;
		} else {
			update_all_counters();
		}

		notify("");
	}
}

function view(id, feed_id, skip_history) {
	
	try {
		debug("loading article: " + id + "/" + feed_id);

		active_real_feed_id = feed_id;

		var cached_article = cache_find(id);

		debug("cache check result: " + (cached_article != false));

/*		if (!skip_history) {
			history_push("ARTICLE:" + id + ":" + feed_id);
		} */
	
		enableHotkeys();
	
		active_post_id = id; 
		//setActiveFeedId(feed_id);

		var query = "backend.php?op=view&id=" + param_escape(id) +
			"&feed=" + param_escape(feed_id);

		var date = new Date();

		if (!xmlhttp_ready(xmlhttp) && last_article_view < date.getTime() / 1000 - 15) {
			debug("<b>xmlhttp seems to be stuck at view, aborting</b>");
			xmlhttp.abort();
		}

		if (cached_article || xmlhttp_ready(xmlhttp)) {

			cleanSelected("headlinesList");

			var crow = document.getElementById("RROW-" + active_post_id);

			var article_is_unread = crow.className.match("Unread");
			debug("article is unread: " + article_is_unread);			

			crow.className = crow.className.replace("Unread", "");

			var upd_img_pic = document.getElementById("FUPDPIC-" + active_post_id);

			if (upd_img_pic) {
				upd_img_pic.src = "images/blank_icon.gif";
			}

			selectTableRowsByIdPrefix('headlinesList', 'RROW-', 'RCHK-', false);
			markHeadline(active_post_id);

			var neighbor_ids = getRelativePostIds(active_post_id);

			/* only request uncached articles */

			var cids_to_request = Array();

			for (var i = 0; i < neighbor_ids.length; i++) {
				if (!cache_check(neighbor_ids[i])) {
					cids_to_request.push(neighbor_ids[i]);
				}
			}

			debug("additional ids: " + cids_to_request.toString());			

			var date = new Date();
			var timestamp = Math.round(date.getTime() / 1000);
			query = query + "&ts=" + timestamp;

			query = query + "&cids=" + cids_to_request.toString();

			if (!cached_article) {

				notify_progress("Loading, please wait...");

				debug(query);

				xmlhttp.open("GET", query, true);
				xmlhttp.onreadystatechange=article_callback;
				xmlhttp.send(null);
			} else if (cached_article && article_is_unread) {

				query = query + "&mode=prefetch";

				debug(query);

				xmlhttp.open("GET", query, true);
				xmlhttp.onreadystatechange=article_callback;
				xmlhttp.send(null);

				render_article(cached_article);

			} else if (cached_article) {

				render_article(cached_article);

			}

			cache_expire();

		} else {
			debug("xmlhttp busy (@view)");
			printLockingError();
		}  

	} catch (e) {
		exception_error("view", e);
	}
}

function toggleMark(id) {

	if (!xmlhttp_ready(xmlhttp_rpc)) {
		printLockingError();
		return;
	}

	var query = "backend.php?op=rpc&id=" + id + "&subop=mark";

	var mark_img = document.getElementById("FMARKPIC-" + id);
	var vfeedu = document.getElementById("FEEDU--1");
	var crow = document.getElementById("RROW-" + id);

	if (mark_img.alt != "Reset mark") {
		mark_img.src = "images/mark_set.png";
		mark_img.alt = "Reset mark";
		query = query + "&mark=1";

		if (vfeedu && crow.className.match("Unread")) {
			vfeedu.innerHTML = (+vfeedu.innerHTML) + 1;
		}

	} else {
		mark_img.src = "images/mark_unset.png";
		mark_img.alt = "Set mark";
		query = query + "&mark=0";

		if (vfeedu && crow.className.match("Unread")) {
			vfeedu.innerHTML = (+vfeedu.innerHTML) - 1;
		}

	}

	var vfeedctr = document.getElementById("FEEDCTR--1");
	var vfeedr = document.getElementById("FEEDR--1");

	if (vfeedu && vfeedctr) {
		if ((+vfeedu.innerHTML) > 0) {
			if (crow.className.match("Unread") && !vfeedr.className.match("Unread")) {
				vfeedr.className = vfeedr.className + "Unread";
				vfeedctr.className = "odd";
			}
		} else {
			vfeedctr.className = "invisible";
			vfeedr.className = vfeedr.className.replace("Unread", "");
		}
	}

	debug("toggle starred for aid " + id);

	new Ajax.Request(query);

}

function moveToPost(mode) {

	// check for combined mode
	if (!document.getElementById("headlinesList"))
		return;

	var rows = getVisibleHeadlineIds();

	var prev_id;
	var next_id;

	if (!document.getElementById('RROW-' + active_post_id)) {
		active_post_id = false;
	}

	if (active_post_id == false) {
		next_id = getFirstVisibleHeadlineId();
		prev_id = getLastVisibleHeadlineId();
	} else {	
		for (var i = 0; i < rows.length; i++) {
			if (rows[i] == active_post_id) {
				prev_id = rows[i-1];
				next_id = rows[i+1];			
			}
		}
	}

	if (mode == "next") {
	 	if (next_id != undefined) {
			view(next_id, getActiveFeedId());
		}
	}

	if (mode == "prev") {
		if ( prev_id != undefined) {
			view(prev_id, getActiveFeedId());
		}
	} 
}

function toggleUnread(id, cmode) {
	try {
		if (!xmlhttp_ready(xmlhttp_rpc)) {
			printLockingError();
			return;
		}
	
		var row = document.getElementById("RROW-" + id);
		if (row) {
			var nc = row.className;
			nc = nc.replace("Unread", "");
			nc = nc.replace("Selected", "");

			if (row.className.match("Unread")) {
				row.className = nc;
			} else {
				row.className = nc + "Unread";
			}

			if (!cmode) cmode = 2;

			var query = "backend.php?op=rpc&subop=catchupSelected&ids=" +
				param_escape(id) + "&cmode=" + param_escape(cmode);

			notify_progress("Loading, please wait...");

			xmlhttp_rpc.open("GET", query, true);
			xmlhttp_rpc.onreadystatechange=all_counters_callback;
			xmlhttp_rpc.send(null);

		}


	} catch (e) {
		exception_error("toggleUnread", e);
	}
}

function selectionToggleUnread(cdm_mode, set_state, callback_func, no_error) {
	try {
		if (!xmlhttp_ready(xmlhttp_rpc)) {
			printLockingError();
			return;
		}
	
		var rows;

		if (cdm_mode) {
			rows = cdmGetSelectedArticles();
		} else {	
			rows = getSelectedTableRowIds("headlinesList", "RROW", "RCHK");
		}

		if (rows.length == 0 && !no_error) {
			alert(__("No articles are selected."));
			return;
		}

		for (i = 0; i < rows.length; i++) {
			var row = document.getElementById("RROW-" + rows[i]);
			if (row) {
				var nc = row.className;
				nc = nc.replace("Unread", "");
				nc = nc.replace("Selected", "");

				if (row.className.match("Unread")) {
					row.className = nc + "Selected";
				} else {
					row.className = nc + "UnreadSelected";
				}
			}
		}

		if (rows.length > 0) {

			var cmode = "";

			if (set_state == undefined) {
				cmode = "2";
			} else if (set_state == true) {
				cmode = "1";
			} else if (set_state == false) {
				cmode = "0";
			}

			var query = "backend.php?op=rpc&subop=catchupSelected&ids=" +
				param_escape(rows.toString()) + "&cmode=" + cmode;

			_catchup_callback_func = callback_func;

			notify_progress("Loading, please wait...");

			xmlhttp_rpc.open("GET", query, true);
			xmlhttp_rpc.onreadystatechange=catchup_callback;
			xmlhttp_rpc.send(null);

		}

	} catch (e) {
		exception_error("selectionToggleUnread", e);
	}
}

function selectionToggleMarked(cdm_mode) {
	try {
		if (!xmlhttp_ready(xmlhttp_rpc)) {
			printLockingError();
			return;
		}
	
		var rows;
		
		if (cdm_mode) {
			rows = cdmGetSelectedArticles();
		} else {	
			rows = getSelectedTableRowIds("headlinesList", "RROW", "RCHK");
		}	

		if (rows.length == 0) {
			alert(__("No articles are selected."));
			return;
		}

		for (i = 0; i < rows.length; i++) {
			var row = document.getElementById("RROW-" + rows[i]);
			var mark_img = document.getElementById("FMARKPIC-" + rows[i]);

			if (row && mark_img) {

				if (mark_img.alt == "Set mark") {
					mark_img.src = "images/mark_set.png";
					mark_img.alt = "Reset mark";
					mark_img.setAttribute('onclick', 
						'javascript:toggleMark('+rows[i]+', false)');

				} else {
					mark_img.src = "images/mark_unset.png";
					mark_img.alt = "Set mark";
					mark_img.setAttribute('onclick', 
						'javascript:toggleMark('+rows[i]+', true)');
				}
			}
		}

		if (rows.length > 0) {

			var query = "backend.php?op=rpc&subop=markSelected&ids=" +
				param_escape(rows.toString()) + "&cmode=2";

			xmlhttp_rpc.open("GET", query, true);
			xmlhttp_rpc.onreadystatechange=all_counters_callback;
			xmlhttp_rpc.send(null);

		}

	} catch (e) {
		exception_error("selectionToggleMarked", e);
	}
}

function cdmGetSelectedArticles() {
	var sel_articles = new Array();
	var container = document.getElementById("headlinesInnerContainer");

	for (i = 0; i < container.childNodes.length; i++) {
		var child = container.childNodes[i];

		if (child.id.match("RROW-") && child.className.match("Selected")) {
			var c_id = child.id.replace("RROW-", "");
			sel_articles.push(c_id);
		}
	}

	return sel_articles;
}

// mode = all,none,unread
function cdmSelectArticles(mode) {
	var container = document.getElementById("headlinesInnerContainer");

	for (i = 0; i < container.childNodes.length; i++) {
		var child = container.childNodes[i];

		if (child.id.match("RROW-")) {
			var aid = child.id.replace("RROW-", "");

			var cb = document.getElementById("RCHK-" + aid);

			if (mode == "all") {
				if (!child.className.match("Selected")) {
					child.className = child.className + "Selected";
					cb.checked = true;
				}
			} else if (mode == "unread") {
				if (child.className.match("Unread") && !child.className.match("Selected")) {
					child.className = child.className + "Selected";
					cb.checked = true;
				}
			} else {
				child.className = child.className.replace("Selected", "");
				cb.checked = false;
			}
		}		
	}
}

function catchupPage() {

	if (document.getElementById("headlinesList")) {
		selectTableRowsByIdPrefix('headlinesList', 'RROW-', 'RCHK-', true, 'Unread', true);
		selectionToggleUnread(false, false, 'viewCurrentFeed()', true);
		selectTableRowsByIdPrefix('headlinesList', 'RROW-', 'RCHK-', false);
	} else {
		cdmSelectArticles('all');
		selectionToggleUnread(true, false, 'viewCurrentFeed()', true)
		cdmSelectArticles('none');
	}
}

function labelFromSearch(search, search_mode, match_on, feed_id, is_cat) {

	if (!xmlhttp_ready(xmlhttp_rpc)) {
		printLockingError();
	}

	var title = prompt("Please enter label title:", "");

	if (title) {

		var query = "backend.php?op=labelFromSearch&search=" + param_escape(search) +
			"&smode=" + param_escape(search_mode) + "&match=" + param_escape(match_on) +
			"&feed=" + param_escape(feed_id) + "&is_cat=" + param_escape(is_cat) + 
			"&title=" + param_escape(title);

		debug("LFS: " + query);
	
		xmlhttp_rpc.open("GET", query, true);
		xmlhttp_rpc.onreadystatechange=dlg_frefresh_callback;
		xmlhttp_rpc.send(null);
	}

}

function editArticleTags(id, feed_id, cdm_enabled) {
	_tag_active_post_id = id;
	_tag_active_feed_id = feed_id;
	_tag_active_cdm = cdm_enabled;
	try {
		_tag_cdm_scroll = document.getElementById("headlinesInnerContainer").scrollTop;
	} catch (e) { }
	displayDlg('editArticleTags', id);
}


function tag_saved_callback() {
	if (xmlhttp_rpc.readyState == 4) {
		try {
			debug("in tag_saved_callback");

			closeInfoBox();
			notify("");

			if (tagsAreDisplayed()) {
				_reload_feedlist_after_view = true;
			}

			if (!_tag_active_cdm) {
				if (active_post_id == _tag_active_post_id) {
					debug("reloading current article");
					view(_tag_active_post_id, _tag_active_feed_id);			
				}
			} else {
				debug("reloading current feed");
				viewCurrentFeed();
			}

		} catch (e) {
			exception_error("catchup_callback", e);
		}
	}
}

function editTagsSave() {

	if (!xmlhttp_ready(xmlhttp_rpc)) {
		printLockingError();
	}

	notify_progress("Saving article tags...");

	var form = document.forms["tag_edit_form"];

	var query = Form.serialize("tag_edit_form");

	xmlhttp_rpc.open("GET", "backend.php?op=rpc&subop=setArticleTags&" + query, true);			
	xmlhttp_rpc.onreadystatechange=tag_saved_callback;
	xmlhttp_rpc.send(null);

}

function editTagsInsert() {
	try {

		var form = document.forms["tag_edit_form"];

		var found_tags = form.found_tags;
		var tags_str = form.tags_str;

		var tag = found_tags[found_tags.selectedIndex].value;

		if (tags_str.value.length > 0 && 
				tags_str.value.lastIndexOf(", ") != tags_str.value.length - 2) {

			tags_str.value = tags_str.value + ", ";
		}

		tags_str.value = tags_str.value + tag + ", ";

		found_tags.selectedIndex = 0;
		
	} catch (e) {
		exception_error(e, "editTagsInsert");
	}
}

function cdmWatchdog() {

	try {

		var ctr = document.getElementById("headlinesInnerContainer");

		if (!ctr) return;

		var ids = new Array();

		var e = ctr.firstChild;

		while (e) {
			if (e.className && e.className == "cdmArticleUnread" && e.id &&
					e.id.match("RROW-")) {

				// article fits in viewport OR article is longer than viewport and
				// its bottom is visible

				if (ctr.scrollTop <= e.offsetTop && e.offsetTop + e.offsetHeight <=
						ctr.scrollTop + ctr.offsetHeight) {

//					debug(e.id + " is visible " + e.offsetTop + "." + 
//						(e.offsetTop + e.offsetHeight) + " vs " + ctr.scrollTop + "." +
//						(ctr.scrollTop + ctr.offsetHeight));

					ids.push(e.id.replace("RROW-", ""));

				} else if (e.offsetHeight > ctr.offsetHeight &&
						e.offsetTop + e.offsetHeight >= ctr.scrollTop &&
						e.offsetTop + e.offsetHeight <= ctr.scrollTop + ctr.offsetHeight) {

					ids.push(e.id.replace("RROW-", "")); 

				}

				// method 2: article bottom is visible and is in upper 1/2 of the viewport

/*				if (e.offsetTop + e.offsetHeight >= ctr.scrollTop &&
						e.offsetTop + e.offsetHeight <= ctr.scrollTop + ctr.offsetHeight/2) {

					ids.push(e.id.replace("RROW-", "")); 

				} */

			}

			e = e.nextSibling;
		}

		debug("cdmWatchdog, ids= " + ids.toString());

		if (ids.length > 0 && xmlhttp_ready(xmlhttp_rpc)) {

			for (var i = 0; i < ids.length; i++) {
				var e = document.getElementById("RROW-" + ids[i]);
				if (e) {
					e.className = e.className.replace("Unread", "");
				}
			}

			var query = "backend.php?op=rpc&subop=catchupSelected&ids=" +
				param_escape(ids.toString()) + "&cmode=0";

			xmlhttp_rpc.open("GET", query, true);
			xmlhttp_rpc.onreadystatechange=all_counters_callback;
			xmlhttp_rpc.send(null); 

		}

		_cdm_wd_timeout = window.setTimeout("cdmWatchdog()", 4000);

	} catch (e) {
		exception_error(e, "cdmWatchdog");
	}

}


function cache_inject(id, article) {
	if (!article_cache[id]) {
		debug("cache_article: miss: " + id);

		var cache_obj = new Array();

		var d = new Date();
		cache_obj["entered"] = d.getTime() / 1000;
		cache_obj["data"] = article;

		article_cache[id] = cache_obj;

	} else {
		debug("cache_article: hit: " + id);
	}
}

function cache_find(id) {
	if (typeof article_cache[id] != 'undefined') {
		return article_cache[id]["data"];
	} else {
		return false;
	}
}

function cache_check(id) {
	return typeof article_cache[id] != 'undefined';
}

function cache_expire() {
	/* TODO */
}
