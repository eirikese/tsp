// Helper function for zero line annotation
// General function to add a dotted average line with AVG label in athlete color
// showLine: show/hide the vertical line, showLabel: show/hide the label
function addAvgLineToDistribChart(chart, avg, color, labelText, showLine = true, showLabel = true) {
  if (!chart || !chart.options.plugins) return;
  if (!chart.options.plugins.annotation) chart.options.plugins.annotation = {};
  // Use labelText if provided, otherwise use color as a unique key (since color is per athlete)
  // If both are undefined, fallback to avg value
  let annId = 'avgline_';
  if (labelText) {
    annId += labelText.replace(/[^a-zA-Z0-9]/g, '');
  } else if (color) {
    annId += color.replace(/[^a-zA-Z0-9]/g, '');
  } else {
    annId += String(avg).replace(/[^a-zA-Z0-9]/g, '');
  }
  if (chart.options.plugins.annotation.annotations && chart.options.plugins.annotation.annotations[annId]) {
    delete chart.options.plugins.annotation.annotations[annId];
  }
  if (!chart.options.plugins.annotation.annotations) chart.options.plugins.annotation.annotations = {};
  chart.options.plugins.annotation.annotations[annId] = {
    type: 'line',
    xMin: avg,
    xMax: avg,
    borderColor: showLine ? color : 'rgba(0,0,0,0)',
    borderWidth: showLine ? 2 : 0,
    borderDash: [6, 6],
    label: {
      display: !!showLabel,
      content: 'AVG  ' + avg.toFixed(2),
      color: color,
      backgroundColor: 'rgba(0,0,0,0)',
      position: 'bottom',
      yAdjust: 40,
      font: {size: 12 },
      padding: 0,
      cornerRadius: 0,
      borderWidth: 0,
      borderRadius: 0,
      textAlign: 'center',
      xAdjust: 0
    },
    z: 20
  };
  chart.update('none');
}
function red_zero_line() {
  return {
    annotations: {
      zeroline: {
        type: 'line',
        xMin: 0,
        xMax: 0,
        borderColor: '#ff0000',
        borderWidth: 1
      }
    }
  };
}


// ---------- chart builders ----------
function makeTimeseries(){
  const ctx=document.getElementById('chart_ts').getContext('2d');
  return new Chart(ctx,{type:'line',data:{datasets:[]},options:{
    animation:false,responsive:true,maintainAspectRatio:false,
    scales:{
      x:{type:'linear',title:{display:false,text:'time (s from start)'},ticks:{callback:v=>Number(v).toFixed(1)}},
      y:{title:{display:true,text:'degrees'},min:-40,max:40}
    },
    plugins:{legend:{position:'bottom'}}
  }});
}
function makeSOG(){
  const ctx=document.getElementById('chart_sog').getContext('2d');
  return new Chart(ctx,{type:'line',data:{datasets:[]},options:{
    animation:false,responsive:true,maintainAspectRatio:false,
    scales:{
      x:{type:'linear',title:{display:false,text:'time (s from start)'},ticks:{callback:v=>Number(v).toFixed(1)}},
      y:{title:{display:true,text:'knots'},min:-8,max:8}
    },
    plugins:{legend:{position:'bottom'}}
  }});
}
function makeMap(){
  map=L.map('map',{zoomControl:true});
  window._tileLayer=null; // set by applyTheme()
  map.setView([0,0],2); mapInited=true;
}
function fitMapIfFirst(lat,lon){ if(!firstMapFixDone){ map.setView([lat,lon],15); firstMapFixDone=true; } }

const points=(xs,ys)=>xs.map((x,i)=>({x,y:ys[i]}));

// multi-dataset density chart
function makeDensityChartMulti(ctx, label, xConf){
  const {min,max,step,type='linear'}=xConf;
  return new Chart(ctx,{
    type:'line',
    data:{datasets:[]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      layout:{padding:{left:10,right:10,bottom:8,top:4}},
      scales:{
        x:{ type, min, max,
            title:{display:true,text:label||'X'},
            grid:{color:Chart.defaults.borderColor,tickLength:4},
            ticks:{
              color:Chart.defaults.color,
              padding:6,
              maxRotation:0,
              minRotation:0,
              callback:(v)=>String(v),
              values: [-40, -30, -20, -10, 0, 10, 20, 30, 40]
            }
          },
        y:{min:0, max:110, grid:{color:Chart.defaults.borderColor,tickLength:4}, ticks:{display:false}}
      },
      plugins:{
        legend:{position:'bottom',labels:{boxWidth:10,boxHeight:10,usePointStyle:true,pointStyle:'line'}},
        tooltip:{mode:'index',intersect:false,callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${Math.round(ctx.parsed.y)}%`}},
        annotation: red_zero_line()
      },
      elements:{line:{tension:0.25,borderWidth:2}, point:{radius:0}}
    }
  });
}
function upsertDistDataset(chart, map, unitId, color){
  if(map[unitId]!=null) return map[unitId];
  const ds={label:unitId,data:[],parsing:true,borderColor:color,backgroundColor:color+'22',fill:true};
  chart.data.datasets.push(ds);
  const idx=chart.data.datasets.length-1;
  map[unitId]=idx;
  return idx;
}

// ---------- distributions state ----------
const DEG_RANGE={min:-40,max:40,step:10,gridCnt:160};
const FREQ_RANGE={min:0.01,max:5,step:1,gridCnt:200};
let distCharts={roll:null,pitch:null,freq:null, xsDeg:null, xsHz:null};
let distIdx={roll:{},pitch:{},freq:{}};

// ---------- timeseries & SOG ----------
function makeTS(){ return makeTimeseries(); }
function makeSOGChart(){ return makeSOG(); }
function makeMapChart(){ return makeMap(); }

// make available to other modules
window.addAvgLineToDistribChart = addAvgLineToDistribChart;
window.red_zero_line = red_zero_line;
window.makeDensityChartMulti = makeDensityChartMulti;
window.upsertDistDataset = upsertDistDataset;
window.makeTS = makeTS;
window.makeSOGChart = makeSOGChart;
window.makeMapChart = makeMapChart;
window.DEG_RANGE = DEG_RANGE;
window.FREQ_RANGE = FREQ_RANGE;
window.distCharts = distCharts;
window.distIdx = distIdx;
window.points = points;
